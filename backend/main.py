"""REST intake + replayable WebSocket events. Run one worker (in-memory jobs)."""
import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from backend.sources import MAX_UPLOAD, fetch_github, github_slug, read_archive
from backend.workflow import run_review
from backend.reports import word_report

load_dotenv()
logger = logging.getLogger(__name__)
ORIGINS = [s.strip() for s in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')]
TTL = 3600


@dataclass
class Job:
    source: str
    status: str = 'queued'
    events: list = field(default_factory=list)
    report: dict | None = None
    finished_at: float | None = None
    task: asyncio.Task | None = None

    async def emit(self, kind, **data):
        self.events.append({'id': len(self.events), 'type': kind, **data})


jobs: dict[str, Job] = {}


def prune():
    for key, job in list(jobs.items()):
        if job.finished_at and time.monotonic() - job.finished_at > TTL:
            del jobs[key]


@asynccontextmanager
async def lifespan(app):
    async def cleanup():
        while True:
            await asyncio.sleep(60)
            prune()
    sweeper = asyncio.create_task(cleanup())
    yield
    sweeper.cancel()
    tasks = [j.task for j in jobs.values() if j.task and not j.task.done()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(sweeper, *tasks, return_exceptions=True)
    jobs.clear()


app = FastAPI(title='CodeScanner', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@app.middleware('http')
async def bound_body(request, call_next):
    # Limit streamed multipart bodies as well as Content-Length before parsing.
    if request.method == 'POST':
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_UPLOAD + 64 * 1024:
                return Response('Request exceeds 20 MB upload limit.', status_code=413)
        sent = False
        async def receive():
            nonlocal sent
            if sent:
                return {'type': 'http.request', 'body': b'', 'more_body': False}
            sent = True
            return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
        request._receive = receive
        request._body = bytes(body)
    return await call_next(request)


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'configured': bool(os.getenv('OPENAI_API_KEY')), 'model': os.getenv('REVIEW_MODEL', 'gpt-4.1-mini')}


async def process(job: Job, data: bytes | None, url: str, focus: str):
    job.status = 'running'
    try:
        if data is None:
            await job.emit('progress', agent='source', status='running', message='Downloading the public repository from GitHub…')
            data, job.source = await fetch_github(url)
        await job.emit('progress', agent='source', status='running', message='Reading source files and preparing the review…')
        files, scope = await asyncio.to_thread(read_archive, data)
        data = None
        await job.emit('progress', agent='source', status='complete', message=f"Prepared {len(files)} files. {len(scope['skipped'])} files excluded.", scope=scope)
        report = await run_review(files, focus, job.emit)
        job.report = {**report, 'source': job.source, 'scope': scope, 'notice': 'AI-assisted static review; code and tests were not executed. Validate findings before applying changes.'}
        job.status = 'complete'
        await job.emit('complete', report=job.report)
    except ValueError as exc:
        job.status = 'error'
        await job.emit('error', message=str(exc))
    except Exception:
        logger.exception('Review failed')
        job.status = 'error'
        await job.emit('error', message='Review could not finish. Check the server logs, API key, model access, and quota, then try again.')
    finally:
        job.finished_at = time.monotonic()


@app.post('/api/reviews', status_code=202)
async def create_review(
    file: Annotated[UploadFile | None, File()] = None,
    repo_url: Annotated[str, Form(max_length=500)] = '',
    focus: Annotated[str, Form(max_length=2000)] = '',
):
    if bool(file) == bool(repo_url.strip()):
        raise HTTPException(400, 'Provide exactly one ZIP file or GitHub repository URL.')
    if repo_url:
        try:
            github_slug(repo_url)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if not os.getenv('OPENAI_API_KEY'):
        raise HTTPException(503, 'Add OPENAI_API_KEY to the server .env file and restart the backend.')
    prune()
    data = None
    if file:
        try:
            if not (file.filename or '').lower().endswith('.zip'):
                raise HTTPException(400, 'Please upload a .zip archive.')
            data = await file.read(MAX_UPLOAD + 1)
            if len(data) > MAX_UPLOAD:
                raise HTTPException(413, 'ZIP exceeds the 20 MB limit.')
        finally:
            await file.close()
    # Reserve capacity without awaiting between the check and insertion.
    if sum(j.status in {'queued', 'running'} for j in jobs.values()) >= 3 or len(jobs) >= 100:
        raise HTTPException(429, 'The review queue is full. Please try again shortly.')
    key = uuid.uuid4().hex
    job = Job(source=(file.filename or 'upload.zip') if file else repo_url.strip())
    jobs[key] = job
    await job.emit('progress', agent='source', status='queued', message='Review queued. Bringing your specialist team together…')
    job.task = asyncio.create_task(process(job, data, repo_url.strip(), focus))
    return {'id': key}


def get_job(key):
    prune()
    if key not in jobs:
        raise HTTPException(404, 'Review not found or expired. Reports are retained for one hour after completion.')
    return jobs[key]


@app.get('/api/reviews/{key}')
async def status(key: str):
    job = get_job(key)
    return {'status': job.status, 'events': job.events, 'report': job.report}


@app.get('/api/reviews/{key}/report')
async def download(key: str, format: str = 'markdown'):
    job = get_job(key)
    if not job.report:
        raise HTTPException(409, 'The report is not ready yet.')
    report = job.report
    if format == 'json':
        return Response(json.dumps(report, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename="review.json"'})
    if format == 'docx':
        return Response(word_report(report), media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document', headers={'Content-Disposition': 'attachment; filename="review.docx"'})
    if format != 'markdown':
        raise HTTPException(400, 'Format must be docx, markdown or json.')
    lines = ['# Code review', '', f"Source: {report['source']}", '', report['summary'], '', report['notice'], '', f"Reviewed {report['scope']['files_reviewed']} files; excluded {len(report['scope']['skipped'])}."]
    if report['incomplete']:
        lines += ['', '**Partial review: at least one specialist failed.**']
    for f in report['findings']:
        lines += ['', f"## [{f['severity'].upper()}] {f['title']}", f"{f['category']} · `{f['file']}:{f['line']}`", '', f['explanation'], '', f"Suggested fix: {f['recommendation']}"]
    lines += ['', '## Specialist summaries']
    for agent in report['agents']:
        lines += ['', f"### {agent['agent']}", agent['summary']]
    if report['scope']['skipped']:
        lines += ['', '## Excluded files']
        lines += [f"- `{f['path']}`: {f['reason']}" for f in report['scope']['skipped']]
    return Response('\n'.join(lines), media_type='text/markdown', headers={'Content-Disposition': 'attachment; filename="review.md"'})


@app.websocket('/ws/reviews/{key}')
async def events(socket: WebSocket, key: str, after: int = -1):
    if socket.headers.get('origin') not in ORIGINS:
        await socket.close(code=1008)
        return
    prune()
    if key not in jobs:
        await socket.close(code=1008)
        return
    await socket.accept()
    job = jobs[key]
    cursor = max(0, min(after + 1, len(job.events)))
    ticks = 0
    try:
        while True:
            for event in job.events[cursor:]:
                await socket.send_json(event)
                cursor += 1
            if job.status in {'complete', 'error'}:
                await socket.close()
                return
            await asyncio.sleep(.25)
            ticks += 1
            if ticks % 60 == 0:
                await socket.send_json({'type': 'heartbeat'})
    except (WebSocketDisconnect, RuntimeError, OSError):
        pass

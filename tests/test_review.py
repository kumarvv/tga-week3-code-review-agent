import asyncio
import io
import json
import stat
import zipfile

import pytest
from docx import Document
from fastapi.testclient import TestClient

from backend import main, workflow, review_agent, orchestrator_agent
from backend.models import AgentReview, Finding
from backend.model_config import REVIEW_MODELS, model_options
from backend.sources import MAX_FILE, github_slug, read_archive


def archive(entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as z:
        for name, content in entries.items():
            z.writestr(name, content)
    return data.getvalue()


def test_ingestion_and_scope():
    files, scope = read_archive(archive({'src/app.py': 'x = 1\n', '.env': 'SECRET=x', 'node_modules/a.js': 'x', 'big.py': 'x' * (MAX_FILE + 1), 'image.png': b'abc'}))
    assert files == [{'path': 'src/app.py', 'content': '1: x = 1', 'lines': 1}]
    assert len(scope['skipped']) == 4


@pytest.mark.parametrize('name', ['../escape.py', '/tmp/escape.py', 'foo\\escape.py'])
def test_unsafe_paths(name):
    with pytest.raises(ValueError, match='unsafe path'):
        read_archive(archive({name: 'pass'}))


def test_symlink_and_invalid_zip():
    info = zipfile.ZipInfo('link.py')
    info.external_attr = (stat.S_IFLNK | 0o777) << 16
    with pytest.raises(ValueError, match='symbolic'):
        read_archive(archive({info: 'target'}))
    with pytest.raises(ValueError, match='Invalid'):
        read_archive(b'not a zip')


@pytest.mark.parametrize('url', ['http://github.com/a/b', 'https://evil.com/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?x=y', 'https://github.com/a/..'])
def test_github_validation(url):
    with pytest.raises(ValueError):
        github_slug(url)


def test_github_normalization():
    assert github_slug('https://github.com/user/repo.git/') == 'user/repo'


class FakeModel:
    def __init__(self, fail=None):
        self.started = set()
        self.fail = fail
        self.all_started = asyncio.Event()

    def with_structured_output(self, schema, **kwargs):
        return self

    async def ainvoke(self, messages):
        system = messages[0][1]
        if 'You are the orchestrator.' in system:
            assert len(self.started) == 3
            if self.fail == 'orchestrator':
                raise RuntimeError('provider error')
            reviews = json.loads(messages[1][1])
            return AgentReview(summary='Combined review', findings=[f for r in reviews for f in r['findings']])
        name = next(name for name in workflow.AGENTS if f'category {name}' in system)
        self.started.add(name)
        if len(self.started) == 3:
            self.all_started.set()
        # Fails if the graph serializes the three specialists.
        await asyncio.wait_for(self.all_started.wait(), timeout=2)
        if self.fail in {name, 'all'}:
            raise RuntimeError('provider error')
        return AgentReview(summary=f'{name} reviewed', findings=[Finding(title=f'{name} issue', severity='high', category=name, file='app.py', line=1, explanation='Evidence', recommendation='Fix it')])


@pytest.mark.parametrize('failure', [None, 'security', 'orchestrator'])
def test_parallel_workflow_and_failure_reporting(monkeypatch, failure):
    async def run():
        fake = FakeModel(failure)
        patch_models(monkeypatch, fake)
        events = []
        async def emit(kind, **data):
            events.append((kind, data))
        result = await workflow.run_review([{'path': 'app.py', 'content': '1: pass', 'lines': 1}], '', emit)
        assert result['incomplete'] == (failure == 'security')
        assert result['synthesis_fallback'] == (failure == 'orchestrator')
        assert len(result['findings']) == (2 if failure == 'security' else 3)
        assert len(events) == 8
    asyncio.run(run())


@pytest.mark.parametrize('selected_model', [None, *REVIEW_MODELS])
def test_rest_websocket_replay_and_download(monkeypatch, selected_model):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.setenv('REVIEW_MODEL', 'gpt-4.1-mini')
    calls = patch_models(monkeypatch, FakeModel())
    with TestClient(main.app) as client:
        response = client.post('/api/reviews', files={'file': ('source.zip', archive({'app.py': 'pass'}), 'application/zip')}, data={'focus': 'Review thoroughly', **({'model': selected_model} if selected_model else {})})
        assert response.status_code == 202, response.text
        key = response.json()['id']
        events = []
        with client.websocket_connect(f'/ws/reviews/{key}', headers={'origin': 'http://localhost:5173'}) as socket:
            while True:
                event = socket.receive_json()
                events.append(event)
                if event['type'] in {'complete', 'error'}:
                    break
        assert events[-1]['type'] == 'complete', events
        assert len(events[-1]['report']['findings']) == 3
        expected_model = selected_model or 'gpt-4.1-mini'
        assert response.json()['model'] == expected_model
        assert events[-1]['report']['model'] == expected_model
        assert [call['model'] for call in calls] == [expected_model] * 4
        with client.websocket_connect(f'/ws/reviews/{key}?after={events[-2]["id"]}', headers={'origin': 'http://localhost:5173'}) as socket:
            assert socket.receive_json()['type'] == 'complete'
        assert client.get(f'/api/reviews/{key}').json()['status'] == 'complete'
        markdown = client.get(f'/api/reviews/{key}/report')
        assert 'attachment' in markdown.headers['content-disposition']
        assert 'app.py:1' in markdown.text
        word = client.get(f'/api/reviews/{key}/report?format=docx')
        assert word.status_code == 200
        assert word.headers['content-type'] == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        assert 'filename="review.docx"' in word.headers['content-disposition']
        document = Document(io.BytesIO(word.content))
        text = '\n'.join(paragraph.text for paragraph in document.paragraphs)
        assert 'CodeScanner code review report' in text
        assert 'app.py:1' in text
        assert events[-1]['report']['summary'] in text
        for finding in events[-1]['report']['findings']:
            assert finding['explanation'] in text
            assert finding['recommendation'] in text
        assert client.get(f'/api/reviews/{key}/report?format=json').json()['source'] == 'source.zip'
        assert client.get('/api/reviews/not-found').status_code == 404


def test_invalid_requests_and_archive_error(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    with TestClient(main.app) as client:
        assert client.post('/api/reviews').status_code == 400
        assert client.post('/api/reviews', data={'repo_url': 'https://evil.com/foo/bar'}).status_code == 400
        assert client.post('/api/reviews', files={'file': ('x.txt', b'pass')}).status_code == 400
        response = client.post('/api/reviews', files={'file': ('bad.zip', b'not a zip')})
        with client.websocket_connect(f'/ws/reviews/{response.json()["id"]}', headers={'origin': 'http://localhost:5173'}) as socket:
            while True:
                event = socket.receive_json()
                if event['type'] == 'error':
                    assert 'ZIP' in event['message']
                    break


def test_missing_key(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    with TestClient(main.app) as client:
        assert client.post('/api/reviews', data={'repo_url': 'https://github.com/a/b'}).status_code == 503


def test_all_agents_fail(monkeypatch):
    async def run():
        patch_models(monkeypatch, FakeModel('all'))
        async def emit(*args, **kwargs):
            pass
        with pytest.raises(RuntimeError, match='All review agents failed'):
            await workflow.run_review([{'path': 'app.py', 'content': '1: pass', 'lines': 1}], '', emit)
    asyncio.run(run())


def test_upload_request_limit(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    with TestClient(main.app) as client:
        response = client.post('/api/reviews', files={'file': ('large.zip', b'x' * (main.MAX_UPLOAD + 100_000))})
        assert response.status_code == 413


def test_github_download(monkeypatch):
    from backend import sources
    import httpx
    original_client = httpx.AsyncClient
    payload = archive({'repo-main/app.py': 'pass'})
    def handler(request):
        assert str(request.url) == 'https://codeload.github.com/user/repo/zip/HEAD'
        return httpx.Response(200, content=payload)
    monkeypatch.setattr(sources.httpx, 'AsyncClient', lambda **kw: original_client(transport=httpx.MockTransport(handler), **kw))
    data, name = asyncio.run(sources.fetch_github('https://github.com/user/repo'))
    assert name == 'user/repo'
    assert read_archive(data)[0][0]['path'] == 'repo-main/app.py'


def patch_models(monkeypatch, fake):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return fake

    monkeypatch.setattr(review_agent, 'ChatOpenAI', create)
    monkeypatch.setattr(orchestrator_agent, 'ChatOpenAI', create)
    return calls


def test_model_options_and_invalid_selection(monkeypatch):
    monkeypatch.setenv('REVIEW_MODEL', 'gpt-4.1-2025-04-14')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    with TestClient(main.app) as client:
        health = client.get('/api/health').json()
        assert health['model'] == 'gpt-4.1-2025-04-14'
        assert health['model'] in health['models']
        assert 'gpt-4.1-mini' in health['models']
        response = client.post('/api/reviews', data={
            'repo_url': 'https://github.com/a/b', 'model': 'invalid-model',
        })
        assert response.status_code == 400
        assert 'Unsupported review model' in response.json()['detail']
        assert not main.jobs


@pytest.mark.parametrize('model_name', REVIEW_MODELS)
def test_model_request_parameters(model_name):
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage

    model = ChatOpenAI(**model_options(model_name), api_key='test-only')
    payload = model._get_request_payload([HumanMessage(content='Review this code')])
    assert payload['model'] == model_name
    if model_name.startswith(('gpt-5', 'gpt-6')):
        assert 'temperature' not in payload
    else:
        assert payload['temperature'] == 0

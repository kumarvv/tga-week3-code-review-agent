"""Bounded archive ingestion. Repository contents are never extracted or executed."""
import io
import re
import stat
import zipfile
from pathlib import PurePosixPath

import httpx

MAX_UPLOAD = 20 * 1024 * 1024
MAX_EXPANDED = 80 * 1024 * 1024
MAX_FILE = 100_000
MAX_CONTEXT = 180_000
MAX_FILES = 150
EXTENSIONS = set('.py .js .jsx .ts .tsx .java .go .rs .c .h .cpp .hpp .cs .rb .php .swift .kt .scala .sh .sql .vue .svelte .html .css .json .yaml .yml .toml .md'.split())
SKIP_DIRS = {'.git', 'node_modules', '.venv', 'venv', 'vendor', 'dist', 'build', '__pycache__', '.next', 'coverage'}
SKIP_FILES = {'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'uv.lock', 'poetry.lock'}


def github_slug(url: str) -> str:
    match = re.fullmatch(r'https://github\.com/([A-Za-z0-9][A-Za-z0-9-]*)/([A-Za-z0-9_.-]+)/?', url.strip())
    if not match:
        raise ValueError('Use a public repository URL: https://github.com/owner/repository (no branch or query).')
    owner, repo = match.groups()
    repo = repo.removesuffix('.git')
    if repo in {'', '.', '..'}:
        raise ValueError('Invalid repository name.')
    return f'{owner}/{repo}'


async def fetch_github(url: str) -> tuple[bytes, str]:
    slug = github_slug(url)
    # Fixed host, no user-controlled redirects or arbitrary fetch targets.
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        async with client.stream('GET', f'https://codeload.github.com/{slug}/zip/HEAD') as response:
            if response.status_code != 200:
                raise ValueError(f'Could not download {slug}. Check that the repository exists and is public (HTTP {response.status_code}).')
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_UPLOAD:
                    raise ValueError('Repository archive exceeds the 20 MB limit.')
    return bytes(data), slug


def read_archive(data: bytes) -> tuple[list[dict], dict]:
    if len(data) > MAX_UPLOAD:
        raise ValueError('ZIP exceeds the 20 MB limit.')
    files, skipped, total = [], [], 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 10_000 or sum(x.file_size for x in entries) > MAX_EXPANDED:
                raise ValueError('Archive exceeds the 10,000 entries or 80 MB expanded limit.')
            names = set()
            for item in sorted(entries, key=lambda x: x.filename):
                path = PurePosixPath(item.filename)
                if path.is_absolute() or '..' in path.parts or '\\' in item.filename or '\x00' in item.filename:
                    raise ValueError('Archive contains an unsafe path.')
                if stat.S_ISLNK(item.external_attr >> 16):
                    raise ValueError('Archives with symbolic links are not supported.')
                if item.is_dir():
                    continue
                name = str(path)
                if name in names:
                    raise ValueError('Archive contains duplicate file paths.')
                names.add(name)
                reason = None
                if any(p in SKIP_DIRS for p in path.parts) or path.name in SKIP_FILES:
                    reason = 'generated or dependency file'
                elif path.name.startswith('.env') or path.suffix.lower() in {'.pem', '.key', '.p12'}:
                    reason = 'potential secret file'
                elif path.suffix.lower() not in EXTENSIONS and path.name not in {'Dockerfile', 'Makefile'}:
                    reason = 'unsupported file type'
                elif item.file_size > MAX_FILE:
                    reason = 'file exceeds 100 KB'
                elif len(files) >= MAX_FILES:
                    reason = '150-file review limit'
                if reason:
                    skipped.append({'path': name, 'reason': reason})
                    continue
                try:
                    content = archive.read(item).decode('utf-8')
                except UnicodeDecodeError:
                    skipped.append({'path': name, 'reason': 'not UTF-8 text'})
                    continue
                if '\x00' in content:
                    skipped.append({'path': name, 'reason': 'binary content'})
                    continue
                numbered = '\n'.join(f'{i}: {line}' for i, line in enumerate(content.splitlines(), 1))
                if total + len(numbered) + len(name) + 30 > MAX_CONTEXT:
                    skipped.append({'path': name, 'reason': 'review context limit'})
                    continue
                files.append({'path': name, 'content': numbered, 'lines': len(content.splitlines())})
                total += len(numbered) + len(name) + 30
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise ValueError('Invalid, encrypted, or unsupported ZIP archive.') from exc
    if not files:
        raise ValueError('No supported source files found in this archive.')
    return files, {'files_reviewed': len(files), 'characters_reviewed': total, 'skipped': skipped}

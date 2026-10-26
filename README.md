# CodeScanner · AI code review

A chat-style code reviewer built with **React, Tailwind CSS, Vite, FastAPI, LangChain, and LangGraph**. Upload a ZIP or enter a public GitHub repository URL. Three specialist agents review bugs/anti-patterns, security, and missing tests in parallel; an orchestrator merges and prioritizes their findings.

## Run locally

You need Python 3.11+, [uv](https://docs.astral.sh/uv/), Node.js 20.19+ (or 22.12+), and an OpenAI API key with access to the configured model.

**1. Backend** — from the repository root:

```sh
cp .env.example .env
# Edit .env and set OPENAI_API_KEY.
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

For IDE debugging in VS Code, open the repository root, select **Backend: FastAPI** in **Run and Debug**, and press **F5**. This uses the project's `.venv` and launches Uvicorn from the repository root so `backend` imports resolve. Running `backend/main.py` directly with **Run Python File** does not start the FastAPI server and can cause `ModuleNotFoundError`.

**2. Frontend** — in a second terminal:

```sh
cd ui
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` and `/ws` to the backend. API documentation: **http://127.0.0.1:8000/docs**.

Port 5173 must be available. If you change the UI port in `ui/vite.config.js`, also update `ALLOWED_ORIGINS` in `.env` and restart the backend.

Set `REVIEW_MODEL` in `.env` to change the default `gpt-4.1-mini`. The UI model selector offers GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna/Sol, GPT-5.6 Sol/Terra/Luna, GPT-5.5, GPT-5.4 (including mini/nano), GPT-5.2/5.1/5 (including mini/nano), GPT-4.1/4o (including mini), and the configured default. The catalog is maintained in `backend/model_config.py` (checked against the [OpenAI catalog](https://developers.openai.com/api/docs/models/all) on October 26, 2026); it is not an account-specific availability check. Newer reasoning models omit temperature; all agents use JSON-schema structured output. The choice applies to all specialists and the orchestrator for that review. The selected model must support structured output and be available to your API key. Keep the key in the backend; no credentials are bundled into the UI. `ALLOWED_ORIGINS` is a comma-separated allowlist for HTTP and WebSocket browser origins.

## Use it

1. Attach or drag in a `.zip` (up to 20 MB), or paste `https://github.com/owner/repository`. GitHub input reviews the default branch; private repositories and branch URLs are unsupported.
2. Choose a GPT model, optionally describe an area to focus on, then press the send arrow.
3. Watch specialist status and progress messages arrive over WebSocket. Interrupted connections automatically reconnect and replay missed events, with REST recovery.
4. Read findings by severity, expand suggested fixes, inspect the review scope, and download a Word document or JSON.

The interface keeps review history for the current browser session. Reloading clears that UI history. Server reports remain available by their review ID for one hour after completion, unless the server restarts. If an agent fails, the report is explicitly marked partial; if all three fail, the review fails. If synthesis fails, the specialist findings are combined and sorted automatically.

## How it works

```text
React chat → POST /api/reviews (multipart ZIP or repo_url + optional focus)
                 ↓
        Bounded, in-memory source reader
                 ↓
        LangGraph parallel fan-out
        ├─ Bugs & anti-patterns agent
        ├─ Security agent
        └─ Test coverage agent
                 ↓ (wait for all three)
        Orchestrator → prioritized report
                 ↓
        WebSocket progress + REST downloads → React
```

The fan-out/fan-in follows the [LangGraph workflow pattern](https://docs.langchain.com/oss/python/langgraph/workflows-agents). LangChain provides the model client and Pydantic structured responses. Each specialist receives the same line-numbered source context. The orchestrator synthesizes their results, then the backend validates locations, deduplicates exact matches, and sorts by severity.

| Location               | Responsibility                                                 |
| ---------------------- | -------------------------------------------------------------- |
| `backend/main.py`      | REST API, WebSocket replay, job lifecycle, downloads           |
| `backend/sources.py`   | Public GitHub download, ZIP validation, source selection       |
| `backend/workflow.py`  | Three parallel specialists, orchestrator, structured findings  |
| `ui/src/App.jsx`       | Chat, upload, live progress, report and session history        |
| `ui/src/style.css`     | Responsive visual design, Tailwind integration, animations     |
| `tests/test_review.py` | Ingestion, parallelism, failure handling, API and stream tests |

## API

- `GET /api/health` — service status, default `model`, selectable `models`, and whether a key is configured (does not validate the key).
- `POST /api/reviews` — multipart form: exactly one `file` or `repo_url`, plus optional `focus` and `model` (defaults to `REVIEW_MODEL`); returns `{ "id": "...", "model": "..." }` with HTTP 202.
- `WS /ws/reviews/{id}?after=-1` — replayable `progress`, `complete`, and `error` events with monotonically increasing IDs; periodic heartbeats. Browser origin must be allowed.
- `GET /api/reviews/{id}` — status, event history, and completed report.
- `GET /api/reviews/{id}/report?format=docx` — download a Word document; use `format=json` for structured output or `format=markdown` for Markdown (the API default).

## Review scope and deployment

This is a local development application, with in-memory jobs and **one backend worker**. There is no authentication. Review IDs provide access to reports; treat them as private. For shared deployment, add authentication, per-user authorization and quotas, durable job storage/queue, and a reverse proxy serving the UI and forwarding `/api` and `/ws`. `npm run build` generates `ui/dist`; Vite's development proxy is not part of the production bundle. The backend allows three active reviews and up to 100 retained jobs per process.

Archives are never extracted or executed. The reader rejects unsafe paths, symlinks, duplicate paths, invalid/encrypted archives, more than 10,000 entries, and more than 80 MB of declared expanded content. It selects up to 150 UTF-8 source/config/documentation files, each at most 100 KB, within a 180,000-character line-numbered context budget. Dependencies, generated files, common lockfiles, `.env` files, and key files are excluded. Every excluded file is listed in the report. Larger projects receive a **partial source review**; split them into smaller ZIPs for broader inspection.

Selected source text is sent to the configured OpenAI model. Excluding common secret filenames does not remove secrets embedded in source: only submit code you can share with that provider. Reviews incur API usage. Source is held in memory during processing; reports retain findings and scope, not the full source context. AI findings need human validation. Tests are not executed, and test coverage is assessed statically, not measured as a percentage.

## Checks

```sh
uv run pytest -q
cd ui
npm run build
```

Backend tests use a deterministic model double: they exercise the actual LangGraph workflow and REST/WebSocket lifecycle without credentials or paid calls. They verify parallel specialist execution, partial failures, replay, download formats, and hostile archive rejection. A live model review requires a valid key and is not part of the automated suite.

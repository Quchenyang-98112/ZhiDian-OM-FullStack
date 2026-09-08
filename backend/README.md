# ZhiDian-OM FastAPI adapter

This adapter connects the Chinese power-plant frontend to the provided ShuangAn backend source. It exposes a small HTTP/SSE contract for local development:

- `GET /health`
- `GET /api/plant/overview`
- `GET /api/plant/stream` (SSE, two-second snapshots)
- `POST /api/simulation/scenario`
- `POST /api/agents/{monitor|diagnosis|decision}/run`
- `POST /api/agents/collaboration/stream` (SSE)
- `GET/POST/PATCH/DELETE /api/knowledge/documents...`
- `GET/PUT /api/llm/config` and `POST /api/llm/chat`

Run from the repository root with the bundled or system Python 3.11+:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

The frontend Vite server on port 5178 proxies only the adapter namespaces to
port 8000. Other Nexus routes remain on the original Node API port 3000.

The default data source is simulation mode. It represents two 600 MW
supercritical coal-fired units and is intentionally read-only. LLM credentials
are accepted in memory for the current adapter process only; they are never
written to `.env`, JSON, or the knowledge directory.

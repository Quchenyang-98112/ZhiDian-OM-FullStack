# ZhiDian OM Full Stack

ZhiDian OM is a Chinese-language smart power operations and maintenance platform for a carbon-aware thermal power plant. It combines a React dashboard, a FastAPI simulation adapter, three cooperating agent roles, local knowledge-base management, and an optional LLM explanation layer.

This repository is the full-stack demonstration build for the ZhiDian OM project. It is designed for local evaluation and competition demonstrations. The default data source is safe, deterministic simulation data for two 600 MW supercritical coal-fired units. It does not connect to production sensors or control electrical equipment.

## What is included

- React 19 and Vite frontend with Chinese plant-operation pages.
- FastAPI adapter on port 8000 for plant snapshots, simulation scenarios, Agent reports, SSE streams, knowledge-base operations, and LLM configuration.
- Two simulated 600 MW units with system-level device and measurement-point inventories, historical trends, alarms, carbon metrics, and renewable-energy absorption metrics.
- Three visible Agent roles: Monitoring Agent, Diagnosis Agent, and Decision Agent.
- Three decision paths: operating-parameter optimization, maintenance-timing optimization, and carbon-aware operation.
- Local knowledge-base management for upload, parsing, rename, delete, search, directory, file-type, and equipment-system classification.
- Fixed ZhiDian Assistant for Chinese text streaming about equipment status, diagnosis, carbon emissions, and energy absorption.
- API-key-by-user configuration. Real LLM keys are not committed to this repository.

## System boundary

The frontend runs at `http://127.0.0.1:5178` and proxies ZhiDian-specific namespaces to FastAPI at `http://127.0.0.1:8000`.

The original Nexus API workspace remains in the monorepo for compatibility with unrelated routes. It is not required for the core ZhiDian plant, Agent, knowledge-base, and LLM demo routes.

```text
Browser
  └─ React/Vite frontend :5178
       ├─ /api/plant/*
       ├─ /api/simulation/*
       ├─ /api/agents/*
       ├─ /api/knowledge/*
       └─ /api/llm/*
             └─ FastAPI adapter :8000
                  ├─ deterministic simulation
                  ├─ three Agent reports and SSE collaboration
                  ├─ local knowledge files
                  └─ optional OpenAI-compatible LLM provider
```

## Agent implementation status

The repository contains the vendored ShuangAn framework and an optional LangGraph graph definition under `backend/vendor/shuangan/orchestration/maintenance_graph.py`.

The currently exposed FastAPI demonstration routes in `backend/app.py` use deterministic reports and stream the Monitoring, Diagnosis, and Decision roles in order. The LLM, when configured, enriches those reports with Chinese natural-language explanations. The LangGraph graph is present as an integration boundary but is not yet the active execution path of the FastAPI demo endpoints.

Do not describe the current demo as production LangGraph execution until the graph is wired into the FastAPI collaboration endpoint and `langgraph` is added to the runtime dependency set.

## Main frontend pages

| Page | Route | Purpose |
| --- | --- | --- |
| Plant overview | `/` | Plant KPIs, alarms, units, Agent status |
| Realtime monitoring | `/energy-flow` | Output, load, carbon, and trend charts |
| Device management | `/devices` | Full device and measurement-point inventory by unit and system |
| Agent collaboration | `/agent-collaboration` | Collaboration center |
| Monitoring Agent | `/agent-collaboration/monitoring` | Measurement quality, trend, and branch decision |
| Diagnosis Agent | `/agent-collaboration/diagnosis` | Selectable task, evidence chain, history, and diagnosis |
| Decision Agent | `/agent-collaboration/decision` | Three-option comparison, comprehensive decision, approval |
| Carbon reduction | `/carbon-reduction` | Baseline, emissions, and estimated reduction |
| Energy absorption | `/energy-absorption` | Renewable output, absorption space, and storage constraints |
| Knowledge base | `/knowledge-base` | Local document management and retrieval |
| AI settings | `/settings/ai` | Provider, base URL, model, and API-key configuration |

## Local development

### Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Python 3.11 or newer

### Install

```powershell
corepack enable
pnpm install
python -m pip install -r backend/requirements.txt
```

### Start FastAPI

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### Start the frontend

Open a second terminal:

```powershell
pnpm --filter @nexus-hems/web dev -- --host 127.0.0.1 --port 5178
```

Open:

```text
http://127.0.0.1:5178
```

## Demonstration flow

1. Open the overview and select a simulation scenario.
2. Use `设备管理` to select a unit, equipment system, device, and measurement point.
3. Open `诊断 Agent`, choose a task and time window, and start evidence retrieval.
4. Review the measurement trend, operating window, procedure source, and historical case source.
5. Jump to `决策 Agent` and compare operating-parameter, maintenance-timing, and carbon-aware options.
6. Generate the comprehensive decision and review its expected energy, carbon, safety, and operations-cost effects.
7. Configure an OpenAI-compatible LLM provider in `设置 → LLM 配置` to enable natural-language enrichment and the fixed ZhiDian Assistant.

## Backend API surface

```text
GET    /health
GET    /api/plant/overview
GET    /api/plant/stream
GET    /api/simulation/scenario
POST   /api/simulation/scenario
POST   /api/agents/monitor/run
POST   /api/agents/diagnosis/run
POST   /api/agents/decision/run
POST   /api/agents/collaboration/stream
GET    /api/knowledge/documents
GET    /api/knowledge/search
POST   /api/knowledge/documents
POST   /api/knowledge/documents/{id}/parse
PATCH  /api/knowledge/documents/{id}
DELETE /api/knowledge/documents/{id}
GET    /api/llm/config
PUT    /api/llm/config
POST   /api/llm/chat
POST   /api/llm/chat/stream
```

## LLM key safety

LLM credentials are entered by the user through the frontend and held in the running FastAPI process for the current demo session. The adapter returns only a masked key through its configuration endpoint and does not write the full key to `.env`, JSON files, the knowledge directory, or source control.

Never commit a real key. Use placeholders in local documentation and rotate any key that has ever been exposed in a repository, screenshot, terminal log, or chat message.

## GitHub Pages note

The canonical demonstration is the local full-stack setup above because GitHub Pages only serves the static frontend and cannot run the FastAPI adapter or LLM proxy. If the Pages workflow is enabled, configure its repository and base-path settings for this repository before treating the deployment as a production demo.

## Safety boundary

Simulation mode is read-only and does not control physical equipment. Any future DCS, SCADA, time-series database, or work-order integration must preserve the data contract, add authentication and audit controls, and require human approval for maintenance, shutdown, or operating-parameter actions.

## License

MIT. See `LICENSE`.

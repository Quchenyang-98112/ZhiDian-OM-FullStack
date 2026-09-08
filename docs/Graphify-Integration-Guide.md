# Graphify Integration Guide

**Version:** 1.0
**Last updated:** 2026-06-29

This document describes how Graphify knowledge graph tooling is integrated into Nexus-HEMS-Dash for improved AI-assisted development and architectural analysis.

## Overview

Graphify converts the codebase into a queryable knowledge graph that helps AI coding assistants (Claude, Cursor, Kimi Code) work more efficiently by providing structured context instead of raw file contents. This significantly reduces token usage and improves the quality of AI assistance on this complex, safety-critical codebase.

## Quick Start

### For Developers

```bash
# Generate the knowledge graph (AST-only, no API cost)
pnpm graphify .

# Or run the full pipeline directly
python -c "
import json
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.analyze import god_nodes, surprising_connections
from graphify.report import generate
from pathlib import Path

result = detect(Path('.'))
code_files = []
for f in result.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

extraction = extract(code_files) if code_files else {'nodes': [], 'edges': []}
G = build_from_json(extraction)
communities = cluster(G)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
report = generate(G, communities, {}, {}, gods, surprises, extraction)
Path('graphify-out/GRAPH_REPORT.md').write_text(report)
Path('graphify-out/graph.json').write_text(json.dumps({'nodes': extraction['nodes'], 'edges': extraction['edges']}, indent=2))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
"
```

### For AI Agents

When working on architecture or cross-module questions, read `graphify-out/GRAPH_REPORT.md` first to understand:
- **God Nodes**: Architectural hotspots that may need refactoring
- **Communities**: Module boundaries and clustering
- **Surprising Connections**: Unexpected relationships between components

## Outputs

| File | Description |
|------|-------------|
| `graphify-out/graph.json` | GraphRAG-ready JSON with nodes and edges |
| `graphify-out/GRAPH_REPORT.md` | Plain-language architecture summary |
| `graphify-out/graph.html` | Interactive visualization (optional) |

## Safety-Critical Analysis

The knowledge graph helps identify:

### Control Paths
Trace energy flow from sensors → controllers → actuators:
- VictronMQTTAdapter → ESSSymmetricController → BatteryData
- KNXAdapter → HeatPumpSGReadyController → SG Ready signals
- OCPP21Adapter → EVSmartChargeController → EV charge current

### Danger Commands
All hardware commands requiring user confirmation (defined in `command-safety.ts`):
- `SET_BATTERY_POWER`, `SET_BATTERY_MODE`
- `SET_EV_POWER`, `SET_EV_CURRENT`, `START_CHARGING`, `STOP_CHARGING`
- `SET_HEAT_PUMP_MODE`, `SET_HEAT_PUMP_POWER`
- `SET_GRID_LIMIT`, `SET_V2X_DISCHARGE`

### Adapter Interfaces
Protocol adapter contracts (all implement `EnergyAdapter` interface):
- **Core**: VictronMQTT, ModbusSunSpec, KNX, OCPP21, EEBUS, Evcc, OpenEMS
- **Contrib**: HomeAssistantMQTT, MatterThread, Zigbee2MQTT, ShellyREST, OpenADR31

### Safety Guardrails
Validation points in the command chain:
- Zod schema validation in `command-safety.ts`
- Rate limiting (30 cmd/min) in WebSocket handler
- IndexedDB audit trail via `nexusDb`
- Danger command confirmation dialog

## CI Integration

The `.github/workflows/graphify.yml` workflow:
- Triggers on push to `main` and manual dispatch
- Generates the knowledge graph after successful build
- Uploads as artifact with 14-day retention
- Reports god nodes and surprising connections in GitHub summary

## MCP Integration

The `.mcp.json` file configures the MCP symbol graph server for advanced queries:
- `graphify query "<question>"` — BFS traversal for broad context
- `graphify path "<A>" "<B>"` — Find path between nodes
- `graphify explain "<concept>"` — Explain a concept using the graph

## Ignore Patterns

The `.graphifyignore` file excludes:
- `node_modules/` — Dependencies
- `dist/`, `coverage/` — Build outputs
- `.turbo/`, `.perf/` — Tooling caches
- `.env*` — Environment files (security)
- Large generated files and documentation images

## Best Practices

1. **Before architecture questions**: Read `GRAPH_REPORT.md` for context
2. **After code changes**: Run `graphify update .` to refresh the graph
3. **For safety analysis**: Use the graph to trace control paths
4. **For onboarding**: The graph helps understand module relationships

## Troubleshooting

### Graphify CLI not found
```bash
pip install graphifyy -q
```

### Large codebase warning
If you see a warning about >2M words or >200 files, run graphify on a subdirectory:
```bash
pnpm graphify apps/web/src/core/adapters
```

### Stale graph
The PreToolUse hook in `.claude/settings.json` will warn if the graph is missing. Regenerate it with the command above.

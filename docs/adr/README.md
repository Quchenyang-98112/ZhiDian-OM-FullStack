# Architecture Decision Records (ADRs)

This log captures the significant architectural decisions for **Nexus-HEMS-Dash**.
Each ADR is an immutable, point-in-time record of one decision, its context, and
its consequences.

- **Format:** [`ADR-000-template.md`](ADR-000-template.md) is the canonical
  template. New ADRs use the list-style metadata block (`- **Status:** …`).
- **When to write one** (per `CLAUDE.md`): a change to the state-management
  approach, a new external dependency > 50 KB gzipped, protocol-adapter
  architecture, the security model, or the build toolchain.
- **Lifecycle:** never delete an ADR. To reverse one, add a new ADR and set the
  old one's status to `Superseded by ADR-XXX` (and fill `Superseded-by`).

**Status values:** `Accepted` (in effect) · `Proposed` (not yet decided) ·
`Deferred` (agreed but not scheduled) · `In Progress` (partially implemented) ·
`Superseded by ADR-XXX` · `Rejected`.

## Log

| ADR | Title | Status | Date | Related |
|----:|-------|--------|------|---------|
| [001](ADR-001-biome-first-toolchain.md) | Biome-First Toolchain | ✅ Accepted | 2026-04-25 | `biome.json` |
| [002](ADR-002-zustand-dual-store-pattern.md) | Zustand Dual-Store Pattern | ✅ Accepted | 2026-04-25 | Supersedes single-store; ADR-018/019/028 |
| [003](ADR-003-jti-revocation-redis-fallback.md) | JTI Revocation — Optional Redis Backend | ✅ Accepted | 2026-04-25 | `jwt-utils.ts` |
| [004](ADR-004-distroless-docker-production.md) | Distroless Docker Production Images | ✅ Accepted | 2026-04-25 | `Dockerfile` |
| [005](ADR-005-dexie-tiered-downsampling.md) | Dexie Tiered Downsampling Strategy | ✅ Accepted | 2026-04-25 | `offline-cache.ts` |
| [006](ADR-006-ring-buffer-per-adapter-sizing.md) | Ring-Buffer Per-Adapter Sizing | ✅ Accepted | 2026-04-25 | ADR-018 |
| [007](ADR-007-chromatic-visual-regression-gate.md) | Chromatic Visual Regression Gate | ✅ Accepted | 2026-04-25 | `chromatic.yml` |
| [008](ADR-008-pii-sanitization-ai-output-filter.md) | PII Sanitization & AI Output Filtering | ✅ Accepted | 2026-04-25 | `shared-types` sanitizers |
| [009](ADR-009-multi-user-rbac-future.md) | Multi-User RBAC — Architecture Pre-Design | ⏳ Deferred | 2026-04-25 | RBAC in Technical-Debt-Registry |
| [010](ADR-010-home-assistant-integration.md) | Home Assistant Integration Architecture | ✅ Accepted | 2026-04-25 | Extended by ADR-023; ADR-021 |
| [011](ADR-011-openapi-auto-generation.md) | OpenAPI Auto-Generation for Backend API | ⏳ Proposed | 2026-04-25 | Unimplemented as of v1.10.0 |
| [012](ADR-012-openadr-ven-client.md) | OpenADR 3.1.0 VEN Client (Frontend Contrib) | ✅ Accepted | 2026-04-25 | ADR-014; `OpenADR31Adapter` |
| [013](ADR-013-v2g-bpt-parameters.md) | V2G BPT Parameters in OCPP21Adapter | ✅ Accepted | 2026-04-25 | `OCPP21Adapter` |
| [014](ADR-014-vpp-single-home-node.md) | VPP as Single-Home Node | ✅ Accepted | 2026-04-25 | ADR-012; `vpp-service.ts` |
| [015](ADR-015-release-automation.md) | Release Automation & Trigger Chain | ✅ Accepted (amended 2026-07-03) | 2026-06-30 | `docs/Release-History.md` |
| [016](ADR-016-tauri-desktop-safety-model.md) | Tauri Desktop Safety & Security Model | ✅ Accepted | 2026-06-30 | ADR-015; Safety-Certification-Notice |
| [017](ADR-017-knowledge-graph-self-reflection.md) | Knowledge-Graph Self-Reflection (Graphify) | ✅ Accepted | 2026-07-01 | ADR-011; `Graphify-Integration-Guide` |
| [018](ADR-018-backend-mediated-protocol-adapters.md) | Backend-Mediated Protocol Adapters (EventBus→WS) | ✅ Accepted (impl. #197) | 2026-07-02 | ADR-002/006; ADR-024/025 build on it |
| [019](ADR-019-adapter-instance-management-and-registry-surfacing.md) | Adapter-Instance Management & Registry Surfacing | ✅ Accepted (impl. #204) | 2026-07-02 | ADR-002/010; `hardware-registry.ts` |
| [020](ADR-020-eebus-spine-backend-adapter.md) | EEBUS SPINE/SHIP Backend Adapter | ✅ Accepted | 2026-07-02 | ADR-018; `EebusProtocolAdapter` |
| [021](ADR-021-ha-exec-adapter-patterns.md) | HA Full Integration & ExecAdapter Security | ✅ Accepted | 2026-07-02 | ADR-010/023; `ExecService` |
| [022](ADR-022-matter-thread-eebus-go-p2-architecture.md) | Matter/Thread + eebus-go — P2 Architecture | 🔄 In Progress (Phase 1 MVP shipped v1.10.0) | 2026-07-02 | ADR-010; FEATURE_STATUS Matter row |
| [023](ADR-023-home-assistant-dual-transport.md) | Home Assistant Dual Transport | ✅ Accepted | 2026-07-02 | Extends ADR-010; ADR-021 |
| [024](ADR-024-adapter-connect-contract.md) | BaseAdapter `connect()` is Non-Throwing | ✅ Accepted | 2026-07-02 | ADR-018/019; `BaseAdapter` |
| [025](ADR-025-backend-ws-consumer.md) | Opt-In Backend WebSocket Consumer | ✅ Accepted | 2026-07-03 | ADR-018; `useServerWebSocket` |
| [026](ADR-026-byok-vault-at-rest.md) | BYOK Vault At-Rest — Non-Extractable CryptoKey | ✅ Accepted | 2026-07-03 | Supersedes HIGH-09; `ai-keys.ts` |
| [027](ADR-027-layered-quality-platforms.md) | Layered Code-Quality Platforms & CI Consolidation | ✅ Accepted | 2026-07-04 | `DEVOPS.md` |
| [028](ADR-028-command-palette-registry.md) | Command Palette Registry & Extensibility | ✅ Accepted | 2026-07-04 | ADR-002/019; `command-safety.ts` |
| [029](ADR-029-local-llm-csp-deferral.md) | Defer In-Browser Local-LLM Engines (CSP + Bundle) | ✅ Accepted | 2026-07-09 | F-03; AUD-02 CSP; `ai-core/providers/local` |

_Legend: ✅ Accepted/in effect · 🔄 In progress · ⏳ Proposed or Deferred (open). See the root [`docs/README.md`](../README.md) for the project-wide status legend._

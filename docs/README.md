# Nexus-HEMS-Dash — Documentation Hub

Central index for the project's documentation. Start here to find the right doc
by task. The shipped release line is **v1.11.1** (2026-09-01) / **v1.11.0** baseline.

> **New here?** Read the root [`README.md`](../README.md) for the project overview,
> then [`CLAUDE.md`](../CLAUDE.md) for the engineering rules, and
> [`docs/Safety-Certification-Notice.md`](Safety-Certification-Notice.md) **before
> connecting any live hardware**.

## Canonical Status Legend

These markers are used across the docs, the [ADR log](adr/README.md), and
[`Technical-Debt-Registry.md`](Technical-Debt-Registry.md). Prefer them over
ad-hoc wording.

| Marker | Meaning |
|--------|---------|
| ✅ | **Shipped / Done / Accepted** — implemented and in effect |
| ⚠️ | **Partial** — usable but incomplete (e.g. MVP, one transport only) |
| 🔄 | **In progress** — actively being built |
| ⏳ | **Planned / Proposed / Deferred / Open** — agreed or intended, not yet done |
| ❌ | **Not planned / Won't fix / Removed** (with a reason) |

**Severity** (debt & findings): `CRIT` (blocks shipping / data loss / breach) ·
`HIGH` (significant risk; fix before next minor) · `MED` (quality/incomplete; fix
within ~2 sprints) · `LOW` (backlog) · `DOC` (documentation-only).

## Source-of-Truth Trackers

| Doc | Owns |
|-----|------|
| [`Technical-Debt-Registry.md`](Technical-Debt-Registry.md) | Known debt, security gaps, incomplete work (ID-prefixed items + Status + "Fixed In") |
| [`../FEATURE_STATUS.md`](../FEATURE_STATUS.md) | Shipped vs partial vs planned feature matrix |
| [`Release-History.md`](Release-History.md) | Canonical tag timeline + manual-release procedure (ADR-015) |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Keep-a-Changelog release notes |
| [`adr/README.md`](adr/README.md) | Architecture Decision Records log (28 ADRs) |

## Getting Started & Project Meta

- [`../README.md`](../README.md) — project overview, feature matrix, quick start
- [`../CLAUDE.md`](../CLAUDE.md) — engineering rules & architecture for contributors/agents
- [`../AGENTS.md`](../AGENTS.md) — Cursor Cloud agent VM specifics
- [`Environment-Variables.md`](Environment-Variables.md) — every env var (scope · default · required)
- [`Developer-Scripts-Reference.md`](Developer-Scripts-Reference.md) — the npm/pnpm scripts and what each does
- [`../DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) — theme tokens & brand utilities
- [`../DEVOPS.md`](../DEVOPS.md) — CI/CD layering & code-quality platforms (ADR-027)
- [`Safety-Certification-Notice.md`](Safety-Certification-Notice.md) — **read before live hardware**

## Architecture & Design

- [`Architecture-Roadmap.md`](Architecture-Roadmap.md) — system architecture & component map
- [`Toolchain-Architecture.md`](Toolchain-Architecture.md) — Biome-first toolchain reference
- [`Security-Architecture.md`](Security-Architecture.md) — threat model, STRIDE, GDPR
- [`Energy-Router-Design.md`](Energy-Router-Design.md) · [`Offline-Sync-Design.md`](Offline-Sync-Design.md)
- [`adr/`](adr/README.md) — **Architecture Decision Records** (start at the [log](adr/README.md); template [`ADR-000`](adr/ADR-000-template.md))

## Protocol Integration Guides

- **Adapter development:** [`Adapter-Dev-Guide.md`](Adapter-Dev-Guide.md) (frontend) · [`Protocol-Adapter-Guide-Backend.md`](Protocol-Adapter-Guide-Backend.md) (backend) · [`Adapter-Safety-Matrix.md`](Adapter-Safety-Matrix.md)
- **EEBUS:** [`EEBUS-Integration-Guide.md`](EEBUS-Integration-Guide.md) · [`EEBUS-Certificate-Setup.md`](EEBUS-Certificate-Setup.md) · [`EEBUS-SHIP-Handshake-Implementation.md`](EEBUS-SHIP-Handshake-Implementation.md)
- **Home Assistant:** [`Home-Assistant-Integration-Guide.md`](Home-Assistant-Integration-Guide.md) · [`HA-Migration-Hybrid-Plan.md`](HA-Migration-Hybrid-Plan.md) · [`HA-Custom-Cards-Sankey.md`](HA-Custom-Cards-Sankey.md)
- **EV / heat pump / inverter:** [`Wallbox-EV-Charging-Guide.md`](Wallbox-EV-Charging-Guide.md) · [`V2G-Integration-Guide.md`](V2G-Integration-Guide.md) · [`Heat-Pump-Integration-Guide.md`](Heat-Pump-Integration-Guide.md) · [`MPPT-Hybrid-Inverter-Guide.md`](MPPT-Hybrid-Inverter-Guide.md)
- **Demand response / VPP:** [`OpenADR-Integration-Guide.md`](OpenADR-Integration-Guide.md) · [`Matter-OpenADR-Interworking-Guide.md`](Matter-OpenADR-Interworking-Guide.md) · [`VPP-FlexMarket-Guide.md`](VPP-FlexMarket-Guide.md)
- **Reference:** [`HEMS-Protocol-Comparison.md`](HEMS-Protocol-Comparison.md) · [`Hardware-Compatibility-Matrix.md`](Hardware-Compatibility-Matrix.md) · [`AI-Providers-Setup.md`](AI-Providers-Setup.md) · [`Tariff-Providers-Setup.md`](Tariff-Providers-Setup.md) · [`API-Reference.md`](API-Reference.md) · [`Command-Palette-Dev-Guide.md`](Command-Palette-Dev-Guide.md)

## Security & Compliance

- [`Security-Architecture.md`](Security-Architecture.md) · [`Security-Roadmap-2026.md`](Security-Roadmap-2026.md)
- [`Supply-Chain-Grype-Policy.md`](Supply-Chain-Grype-Policy.md) · [`Adapter-Safety-Matrix.md`](Adapter-Safety-Matrix.md) · [`AFIR-Compliance-Checklist.md`](AFIR-Compliance-Checklist.md)
- [`Safety-Certification-Notice.md`](Safety-Certification-Notice.md)

## Operations & Runbooks

- **Deploy:** [`Deployment-Guide.md`](Deployment-Guide.md) · [`Deployment-Checklist.md`](Deployment-Checklist.md) · [`Manual-Workflow-Triggers.md`](Manual-Workflow-Triggers.md) · [`Release-History.md`](Release-History.md) · [`Release-GH_TOKEN-Setup.md`](Release-GH_TOKEN-Setup.md)
- **Observability:** [`Observability-Plan.md`](Observability-Plan.md) · [`Grafana-Dashboards-Custom.md`](Grafana-Dashboards-Custom.md)
- **Support:** [`Troubleshooting.md`](Troubleshooting.md) · [`PR-FEEDBACK-PLAYBOOK.md`](PR-FEEDBACK-PLAYBOOK.md) · [`Graphify-Integration-Guide.md`](Graphify-Integration-Guide.md)
- **Campaign closeout:** [`Campaign-Handoff-2026-09.md`](Campaign-Handoff-2026-09.md) (post-v1.11.0 freeze, Sep 2026)
- [`runbooks/`](runbooks/) — per-platform integration runbooks

## Accessibility & UX

- [`Accessibility-Testing-Guide.md`](Accessibility-Testing-Guide.md) · [`WCAG-2.2-Audit.md`](WCAG-2.2-Audit.md) · [`UI-UX-Audit-2026.md`](UI-UX-Audit-2026.md)

## Roadmaps & Planning (living)

- [`Master-Improvement-Roadmap.md`](Master-Improvement-Roadmap.md) · [`Perfection-Roadmap.md`](Perfection-Roadmap.md)
- [`Backend-Implementation-Roadmap.md`](Backend-Implementation-Roadmap.md) · [`Monorepo-Optimization-Roadmap.md`](Monorepo-Optimization-Roadmap.md) · [`Biome-Migration-Roadmap.md`](Biome-Migration-Roadmap.md)
- [`Performance-Optimization-Plan.md`](Performance-Optimization-Plan.md) · [`Testing-Coverage-Strategy.md`](Testing-Coverage-Strategy.md) · [`Test-Coverage-TODO.md`](Test-Coverage-TODO.md)
- [`Plugin-Marketplace-Spec.md`](Plugin-Marketplace-Spec.md)

## Audit History & Archive

Point-in-time audit reports and superseded plans — kept as historical record,
not live guidance. (These are being relocated under `docs/archive/` with
"superseded" banners.) Examples: the `Audit-Report-2026-*` series,
`Post-Audit-Remediation-Summary-2026-07-04`, `Phase0-Gap-Analysis-2026-07-05`,
`Settings-Help-Audit-2026-07-04`, `Security-Remediation-2026-04`,
`Ecosystem-Expansion-Roadmap-v5`, `Campaign-Handoff-2026-07`, and
`Post-Implementation-Hardening-Plan-v6`. For current state, always prefer the
[source-of-truth trackers](#source-of-truth-trackers) above.

---

_Missing something? This hub is curated — when you add a doc, add it here and, if
it records an architectural decision, add an [ADR](adr/README.md) too._

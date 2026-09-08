# ADR-019: Adapter-instance management & hardware-registry surfacing (not "brand de-biasing")

- **Status:** Accepted (implemented — PR #204, v1.3.x; registry expanded to 190 devices in P2 #212)
- **Date:** 2026-07-02
- **Deciders:** Maintainer
- **Related:** ADR-002 (Zustand dual-store), ADR-010 (Home Assistant integration), `docs/Adapter-Dev-Guide.md`, `docs/Audit-Report-2026-07-02.md`, `apps/web/src/core/hardware-registry.ts`, MED-19 in `docs/Technical-Debt-Registry.md`

> **Supersession (v1.6.1):** MED-19 resolved — registry browser + wizard at `/settings/hardware`; registry expanded to **190 devices** (P2 #212). Context below reflects the 2026-07-02 decision baseline.

## Context

A proposed body of work framed the platform as "Victron-centric" and called for a
"brand-agnostic transformation." The 2026-07-02 audit tested that premise against the code
and found it **largely false**:

- No adapter is enabled by default — `isBuiltinAdapterEnabledByDefault()` returns `false`
  (`apps/web/src/lib/adapter-mode.ts`); all five built-ins start disabled.
- `apps/web/src/core/hardware-registry.ts` already holds **113 devices across ~30
  manufacturers** (inverter/wallbox/meter/battery/heatpump), with tested query helpers
  (`getAllDevices`, `searchDevices`, `getDevicesByManufacturer`, `getDevicesByProtocol`, …).
  **Victron is 7 of 113 (~6%).**
- All 13 frontend adapters are real, full `BaseAdapter` implementations of comparable
  maturity; Settings and controller pipelines are protocol-agnostic; the multi-instance
  merge (`useEnergyStore` `accumulatePending()`) treats every adapter identically.

Victron prominence exists only in **cosmetic** surfaces: the locale display name
(`defaultName_victron`), educational help copy (Cerbo GX vs Venus OS), and the e2e mock
simulator (`victron-simulator.ts`). There is no runtime bias to remove.

The **real** gap hiding under the "brand-agnostic" framing is UX, not architecture: there is
**no user-facing "add adapter instance" wizard**, and the 113-device registry is **never
surfaced in a browsable UI**. Users configure adapters through store calls, not a discoverable
flow. That is what limits perceived multi-vendor breadth.

## Decision

Reject the "de-bias" framing and instead invest the effort in the genuine gap (tracked as
MED-19), in later campaign PRs:

1. **Surface the existing hardware registry (no data model change).** Add a browsable,
   searchable, filterable registry view (by manufacturer / protocol / category / capability)
   driven by the existing `hardware-registry.ts` query functions — reuse, do not rebuild. It
   stays vendor-neutral by construction because the registry already is.

2. **Add a schema-driven "add adapter instance" wizard.** Select protocol → (optionally)
   pick a registry device to pre-fill → enter connection params from the adapter's Zod config
   schema → test → name + enable. Builds on the now-modular Settings tab pattern
   (`apps/web/src/components/settings/`, MED-16) and the multi-instance support already in
   `useEnergyStore`.

3. **Neutralize cosmetic Victron references only.** Keep the excellent Victron adapter as
   one first-class option among many; make the default instance name protocol-based rather
   than `defaultName_victron`, and present Victron in help/onboarding as one example
   ecosystem, not the implied center. No adapter is added, removed, or reweighted.

4. **Do NOT introduce a parallel `DeviceProfile`/`VendorProfile` abstraction.** The
   `hardware-registry.ts` device shape + adapter Zod config schemas already cover the need;
   a second abstraction would duplicate them. Revisit only if user-defined custom profiles
   (import/export JSON) are requested.

This ADR records the **redirect and its scope**; implementation lands in later PRs.

## Consequences

- **Positive:** effort goes to the real UX gap (discoverability + guided setup) instead of a
  non-existent bias; reuses the tested registry and existing multi-instance merge; keeps the
  data model single-sourced.
- **Positive:** the platform's genuine vendor-neutrality becomes *visible* to users, which is
  the actual goal the "brand-agnostic" ask was reaching for.
- **Negative / residual:** a registry browser + wizard is real UI surface — it must carry the
  project's a11y (WCAG 2.2 AA), i18n (en/de), theme-token, and test discipline like any other
  feature; the registry's device coverage becomes more visible and will attract requests to
  expand it.
- **Revisit if:** users need custom/importable device profiles (then add an import/export path
  to the registry, still without a second abstraction), or if a marketplace of npm contrib
  adapters (already sketched in `docs/Adapter-Dev-Guide.md`) makes a richer profile format
  worthwhile.

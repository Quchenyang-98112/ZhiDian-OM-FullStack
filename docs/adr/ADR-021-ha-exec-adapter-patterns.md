# ADR-021: Home Assistant Full Integration & ExecAdapter Security Model

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Core team
- **Related:** Ecosystem Expansion Roadmap v5.0 (Phase B / P0), ADR-010 (HA integration)

---

## Problem Statement

### Home Assistant

The existing `HomeAssistantMQTTAdapter` (contrib) used a JSON-over-WebSocket shim
that would not work with a real Mosquitto MQTT broker or HA's native WebSocket API.
The adapter also had no MQTT Discovery support, limiting it to a hardcoded set of 9
entity IDs that users had to manually configure.

### ExecAdapter

Advanced users with custom hardware (RS485 meters, proprietary protocols, embedded
sensors) had no integration path short of writing a full frontend adapter. Any naive
"run arbitrary command" approach is a critical security vulnerability.

---

## Decision

### Home Assistant: Dual-Mode Architecture

**Option A (Chosen):** Two connection modes behind one adapter class:

1. `ha-ws-api` (new, recommended): Connects to `ws://ha:8123/api/websocket`.
   Authenticates with a Long-Lived Access Token. Subscribes to `state_changed` events.
   Auto-discovers energy entities by `device_class`. Sends service calls via HA WS API.

2. `mqtt-broker` (legacy, backward-compatible): Connects to Mosquitto MQTT-over-WS.
   Subscribes to MQTT Discovery topics. Falls back to static `entityMap`.

**Rejected Option B:** Separate `HomeAssistantWSAdapter` class.
   Rejected because it would require users to choose between two adapters and
   duplicates entity role resolution, discovery, and command mapping logic.

**Rejected Option C:** Use full `mqtt.js` library.
   Rejected because the frontend is browser-based and `mqtt.js` requires a WebSocket
   transport anyway. The existing `WebSocket`-based approach is equivalent. Using
   `mqtt.js` would add bundle size (≈50 KB gzipped) with no behavioral benefit in
   browser context.

### Auto-Discovery Heuristics (ha-ws-api mode)

Priority order for mapping HA entity → HEMS energy role:
1. Explicit `entityRoles` config override (user wins)
2. Pre-seeded `discoveredEntityRoles` map (already resolved earlier in session)
3. Friendly name / entity_id keyword matching (e.g., "solar", "battery", "grid")
4. `device_class` + unit_of_measurement heuristics

This ordering means user overrides always win, cached lookups avoid redundant
work, and auto-detection handles the common case without configuration.

### ExecAdapter: Whitelist-Only, argv-Array Model

**Threat model:** An attacker who can modify ExecAdapter configuration or send
crafted messages could attempt shell injection. The security constraints are:

1. **No shell expansion.** `child_process.spawn(command, argv, { shell: false })`.
   Arguments are passed as an array; never concatenated.
2. **Server-side whitelist.** `scriptId` must match a key in `EXEC_SCRIPTS_CONFIG`.
   The frontend validates format; the backend validates against the whitelist.
3. **Argument allowlist.** Each script config defines `allowedArgs`; unknown keys
   are rejected with 403.
4. **Argument value regex.** Values must match `/^[a-zA-Z0-9_\-./: ]{0,256}$/`.
   Semicolons, backticks, dollar signs, redirects, etc., are all rejected.
5. **Timeout.** Hard 30s default; configurable per script. Process is SIGKILL'd.
6. **Output cap.** 64 KB stdout cap prevents memory exhaustion from runaway scripts.
7. **READ_ONLY_MODE.** Command requests (POST /api/exec/command) are blocked when
   `READ_ONLY_MODE=true`.
8. **Audit log.** All exec command requests are logged to `command-audit.ndjson`.

**Rejected Option:** Accept arbitrary command strings from the frontend.
This is a critical vulnerability — rejected unconditionally.

**Rejected Option:** Use `execFile` with `shell: true` option.
This would re-enable shell expansion — rejected unconditionally.

---

## Consequences

### Home Assistant
- Users with HA ≥ 2023.9 can connect directly without configuring a separate
  MQTT broker.
- Auto-discovery eliminates the need to find and configure 9+ entity IDs manually.
- Backward compatible: mqtt-broker mode works unchanged for existing users.
- `discoveredEntityCount` getter allows the Settings UI to show how many entities
  were auto-discovered (future: show in Monitoring panel).
- New `haMode`, `haToken`, `entityRoles` config options added to the adapter
  config schema and Settings → Adapters UI.

### ExecAdapter
- Custom hardware integration is now possible without writing TypeScript.
- The whitelist model means ops teams must configure `EXEC_SCRIPTS_CONFIG` before
  any script can run — this is by design (defence in depth).
- No direct subprocess access from browser — all execution is server-side and
  requires network + JWT authentication.
- The 30s timeout and output cap protect against runaway or malicious scripts.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/core/adapters/contrib/homeassistant-mqtt.ts` | Full rewrite — ha-ws-api mode, auto-discovery, 10+ command types |
| `apps/web/src/core/adapters/contrib/exec-adapter.ts` | New — safe ExecAdapter frontend |
| `apps/api/src/services/ExecService.ts` | New — whitelist-only script execution |
| `apps/api/src/routes/exec.routes.ts` | New — `/api/exec/run`, `/api/exec/command`, `/api/exec/scripts` |
| `apps/api/src/index.ts` | Register exec routes |
| `apps/api/src/data/device-map.example.json` | +15 device profiles (hybrid inverters, MPPT, batteries, meters, heat pump) |
| `docs/Ecosystem-Expansion-Roadmap-v5.md` | New — comprehensive ecosystem plan |

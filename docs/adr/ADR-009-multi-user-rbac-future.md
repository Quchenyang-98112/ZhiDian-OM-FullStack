# ADR-009: Multi-User RBAC — Architecture Pre-Design (Deferred)

- **Status:** Deferred — no target release (re-evaluated 2026-07-09; still open at v1.10.0, tracked as RBAC / ADR-009 in `docs/Technical-Debt-Registry.md`)
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Implementation target:** TBD (originally v1.2.0; deferred past v1.10.0)

## Context

Nexus-HEMS-Dash is currently a single-user system:
- JWT scope (read / readwrite / admin) controls API access
- No concept of multiple users sharing a dashboard
- No per-user settings, roles, or device visibility scoping

For family/multi-tenant use cases (household with multiple members, property management), RBAC
with shared dashboards is needed.

## Proposed Architecture (Future)

### Authentication

**Option A: Clerk (managed, recommended)**
- Hosted auth with social login, MFA, passwordless
- React SDK (`@clerk/clerk-react`) — minimal frontend code
- JWT integration: Clerk-issued JWTs verified by Express middleware
- Pricing: free up to 10 000 MAU
- Trade-off: vendor dependency

**Option B: Custom JWT + SQLite**
- Extend `apps/api/src/jwt-utils.ts` with user claims
- SQLite user table via `better-sqlite3` (already in dependencies)
- Full control, no vendor
- Trade-off: manual auth implementation (passwords, MFA, sessions)

**Decision deferred** — options remain open; originally slated for a v1.2.0 planning sprint (now past; still unscheduled at v1.10.0).

### Data Model

```sql
-- users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,      -- UUID
  email TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'viewer', -- owner | admin | editor | viewer
  tenant_id TEXT,
  created_at INTEGER
);

-- tenant_settings table
CREATE TABLE tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  shared_dashboards BOOLEAN DEFAULT FALSE,
  adapter_visibility TEXT  -- JSON: per-user adapter access
);
```

### Frontend Changes

- User context via React Context or Zustand slice
- Settings page: User management tab (owner only)
- Dashboard: per-user preference overrides
- Adapter visibility: hide adapters not assigned to current user's role

### Backend Changes

- `requireJWT` middleware extended with `userId` → `req.user`
- All `/api/v1/history` queries scoped by `tenant_id`
- WebSocket connections bound to `userId`
- Audit trail includes `userId`

## Trigger Criteria for Implementation

1. User demand (GitHub issue with ≥10 👍)
2. Dedicated planning sprint (originally targeted v1.2.0)
3. Auth provider decision (Clerk vs. custom)
4. Security review of tenant isolation

## Not in Scope for the initial RBAC increment

- Fine-grained device-level permissions
- External identity providers (enterprise SSO, SAML)
- Billing / paid tier features

## Related Files

- `apps/api/src/middleware/auth.ts` — existing JWT scope middleware
- `apps/api/src/jwt-utils.ts` — JWT implementation
- `docs/Security-Architecture.md` — threat model (section: multi-user)
- `docs/Master-Improvement-Roadmap.md` — deferred steps table

## Draft Issue

When ready to implement, open a GitHub issue with label `enhancement`, scope `auth`, with
this ADR linked. Target milestone: TBD (originally `v1.2.0`; deferred past v1.10.0).

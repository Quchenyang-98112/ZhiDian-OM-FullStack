# ADR-004: Distroless Docker Production Images

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** @qnbs
- **Supersedes:** Alpine-based production stages (pre-2026-04-25)

## Context

The current Docker images use `node:24-alpine` and `nginx:1.29-alpine` in their production stages.
Alpine reduces image size, but it still includes:

- A full package manager (`apk`)
- A shell (`/bin/sh`)
- Common UNIX utilities (`ls`, `cat`, `wget`, `curl`, etc.)
- glibc compatibility libraries

These components expand the attack surface:
- Shell injection via container escape → attacker has a shell
- Package manager allows `apk add` post-exploitation
- Many CVEs affect Alpine base packages (libssl, libxml2, etc.)

## Decision

Migrate production-stage Docker images to **Google distroless**:

| Image | Previous | New |
|-------|----------|-----|
| Frontend (nginx) | `nginx:1.29-alpine` | `nginx:1.29-alpine` → keep for now; `nginxinc/nginx-unprivileged:1.29-alpine-slim` as hardened variant |
| Backend (Node.js) | `node:24-alpine` | `gcr.io/distroless/nodejs24-debian13` |

### Dockerfile strategy

```dockerfile
# Build stage — Alpine (full toolchain needed)
FROM node:24-alpine AS build
# ...

# Production stage — distroless (Node.js only, no shell)
FROM gcr.io/distroless/nodejs24-debian13 AS production
COPY --chown=nonroot:nonroot --from=build /tmp/api-deploy ./
USER nonroot
CMD ["index.ts"]  # tsx entrypoint
```

> **Note:** The nginx frontend image retains Alpine but uses `nginx-unprivileged` for tighter
> permissions, as a full distroless nginx variant is not officially available from Google. The
> backend (Express/Node.js) migrates to full distroless.

## Rationale

- **No shell** → shell injection impossible post-exploit
- **No package manager** → `apk add` / `apt-get` unavailable to attacker
- **Minimal attack surface** — contains only Node.js runtime + app files
- **Smaller image** — distroless Node.js ~50 MB vs Alpine Node.js ~180 MB
- **Supply chain** — fewer OS packages = fewer CVEs to track

## Consequences

**Positive:**
- Container CVEs significantly reduced
- Image size reduced by ~130 MB (backend)
- No shell = no interactive attacker session

**Negative:**
- `docker exec -it <container> /bin/sh` no longer works in production
- Use `kubectl debug` or `docker debug` for ephemeral debugging containers
- `HEALTHCHECK` must use Node.js script instead of `wget`/`curl`

## Debugging Distroless Containers

```bash
# Kubernetes ephemeral debug container
kubectl debug -it <pod> --image=busybox --target=nexus-hems-server

# Docker (BuildKit debug mode)
docker debug <container>
```

## Related Files

- `Dockerfile` — frontend (nginx-unprivileged)
- `Dockerfile.server` — backend (distroless Node.js)

## Supporting Links

- [GoogleContainerTools/distroless](https://github.com/GoogleContainerTools/distroless)
- [Chainguard Images (alternative)](https://www.chainguard.dev/oss-packages)

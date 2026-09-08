# Supply Chain — Grype Vulnerability Policy

> **Status:** Active (v1.3.0)  
> **Owner:** Security / CI maintainers  
> **Config file:** `.grype.yaml` (repository root)

## Policy

Nexus-HEMS enforces **blocking Grype scans** on all production container images and the source SBOM (`sbom-scan.yml`, `container-publish.yml`). The severity cutoff is **critical**.

We **do not** use `only-fixed: true` globally. That flag silences every unpatched critical CVE — including new zero-days without fixes — and is unsuitable as a permanent strategy.

Instead we use **targeted ignore rules** in `.grype.yaml`: each exception must name a specific CVE, optional package matcher, and a documented `reason`.

## Current accepted exception (SUPPLY-02)

| CVE | Package | Image scope | Fix status | Review by |
|-----|---------|-------------|------------|-----------|
| CVE-2026-5450 | `libc6` (deb) | Backend (`Dockerfile.server` → distroless debian13) | won't fix (upstream) | 2026-09-29 |

### Why this CVE is accepted

- Present in `gcr.io/distroless/nodejs24-debian13:nonroot` glibc (`libc6 2.41-12+deb13u3`).
- Debian/distroless have not published a patched package.
- Application code cannot remediate OS-level glibc in a distroless image without rebasing.

### Compensating controls (defense in depth)

| Layer | Control |
|-------|---------|
| **Build** | Grype blocks all *other* critical CVEs; SBOM artifacts retained |
| **Image** | Distroless nonroot (uid 65532), minimal attack surface |
| **Kubernetes** | PSS `restricted`, `readOnlyRootFilesystem`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault` |
| **Network** | `NetworkPolicy` restricts ingress/egress (`helm/nexus-hems/templates/networkpolicy.yaml`) |
| **Compose** | `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs for `/tmp` |

## Adding or removing an ignore rule

1. Confirm the CVE is **specific**, reproducible, and documented (NVD/debian tracker link).
2. Add a rule to `.grype.yaml` with `vulnerability`, `package` (name + type), and `reason`.
3. Register in `docs/Technical-Debt-Registry.md` under **SUPPLY-02**.
4. Set a **quarterly review date** in the registry entry.
5. Run `scripts/verify-grype-policy.sh` locally.
6. Open a PR — CI must stay green **without** `only-fixed: true`.

**Never** add catch-all rules (`vulnerability: "*"`) or package-less ignores.

## Guardrails

`scripts/verify-grype-policy.sh` runs in `sbom-scan.yml` and fails if:

- `.grype.yaml` is missing
- More than **5** ignore rules exist (raises the bar for new exceptions)
- Required `reason` fields are absent

## Alternatives considered

| Approach | When to use |
|----------|-------------|
| **Targeted `.grype.yaml` (current)** | Known upstream won't-fix in pinned base — minimal blast radius |
| **Chainguard / Wolfi base** | Zero-known-CVE SLA required; evaluate in SUPPLY-03 |
| **Alpine + musl** | glibc CVE class eliminated; requires musl compatibility testing |
| **`only-fixed: true`** | Emergency pipeline unblock only — not permanent |

## References

- `.github/workflows/sbom-scan.yml`
- `.github/workflows/container-publish.yml`
- `docs/adr/ADR-004-distroless-docker-production.md`
- `docs/Technical-Debt-Registry.md` — SUPPLY-01, SUPPLY-02

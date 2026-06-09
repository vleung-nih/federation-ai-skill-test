# Image Mode — Phase Details

Loaded by `container-security-review` when `MODE=image`. Read this file after Phase 0 determines the mode.

---

## Phase 1b — Confirm Image Accessibility

Run:

```bash
docker image inspect <image>
```

If this exits non-zero, the image is not available locally. Attempt to pull:

```bash
docker pull <image>
```

If the pull also fails, stop immediately:

> "Image `<image>` was not found locally and could not be pulled from the registry. Please verify the reference and try again."

Do not proceed to Phase 2.

---

## Phase 5 — Candidate Base Image Discovery

Run this phase only when Phase 4 produced at least one CRITICAL/HIGH OS/base-image finding.

If no Dockerfile is accessible (checked via `ls Dockerfile` or `find . -name Dockerfile -maxdepth 3`): skip this phase. All OS findings will be listed under "No fix available — Dockerfile not found" in Phase 6.

### 5a. Identify the current base

Read the Dockerfile. Identify the **last** `FROM` line (the final stage). Extract:
- Registry (default: `docker.io`)
- Image name (e.g. `ubuntu`, `library/python`)
- Tag (e.g. `22.04`, `3.11-slim`)
- Distro family and variant

If intermediate build stages also carry CRITICAL/HIGH OS findings, note them in Phase 8 output as "intermediate stage CVEs — beyond scope of base image replacement."

### 5b. List candidate tags

Prefer `skopeo list-tags` if available:

```bash
skopeo list-tags docker://docker.io/library/<image-name>
```

If `skopeo` is not installed, use the registry tags API:

```bash
curl -s "https://registry.hub.docker.com/v2/namespaces/library/repositories/<image-name>/tags?page_size=100" \
  | grep -o '"name":"[^"]*"' | cut -d'"' -f4
```

For private registries: read credentials from `~/.docker/config.json`. Pass `--creds` to `skopeo` or an `Authorization` header to the API call.

Filter the returned tag list:
- Keep only tags in the same distro family and variant (e.g. if current is `ubuntu:22.04`, keep `22.04.x` and `24.04`; exclude Alpine, Debian, `latest`, `-rc`, `-beta`)
- Exclude EOL and non-LTS tags
- Sort by recency; keep the top 3

Do not recommend a different distro family or a major runtime version bump without flagging it explicitly:
> ⚠ Candidate `python:3.12-slim` is a major version bump from `python:3.11-slim`. This may introduce breaking changes in your application runtime.

### 5c. Build and scan each candidate

For each of the top 2–3 candidates:

1. Create a modified Dockerfile with the final-stage `FROM` line substituted:

```bash
sed "s|FROM <current-base>|FROM <candidate-tag>|" Dockerfile > /tmp/Dockerfile.csr-candidate
```

2. Build the candidate image:

```bash
docker build -f /tmp/Dockerfile.csr-candidate -t <image>-csr-candidate-<sanitised-tag> .
```

If `docker build` exits non-zero: mark candidate "build failed — not comparable (`<first line of error>`)", skip to next candidate. Do not stop the phase.

3. Scan with the same scanners that succeeded in Phase 2:

```bash
# Trivy example:
trivy image --format json --output /tmp/csr-candidate-<tag>-trivy.json <image>-csr-candidate-<sanitised-tag>
```

4. Parse candidate output using Phase 3 normalisation. Count CRITICAL and HIGH findings.

5. Remove the candidate image immediately after scanning:

```bash
docker rmi <image>-csr-candidate-<sanitised-tag>
```

After all candidates have been built and scanned, remove shared temp files:

```bash
rm -f /tmp/Dockerfile.csr-candidate /tmp/csr-candidate-*.json
```

### 5d. Select recommendation

Build a comparison table:

| Candidate | CRITICAL | HIGH | vs current (CRITICAL Δ / HIGH Δ) | Notes |
|---|---|---|---|---|
| ubuntu:22.04.3 | 2 | 1 | −3 / −1 | Same LTS line |
| ubuntu:24.04 | 0 | 0 | −5 / −2 | New LTS line |

Recommend the candidate with the fewest CRITICAL+HIGH findings while staying on the same LTS line. If no candidate reduces CRITICAL/HIGH findings: mark all OS findings "no safe base upgrade found — no fix available."

Present the table in Phase 6 as part of the OS fix action.

---

## Phase 7b — OS / Base-Image Fix

1. Record the original final-stage FROM line.
2. Update the Dockerfile in-place (the real Dockerfile, not a temp copy):

```bash
sed -i.bak "s|FROM <current-base>|FROM <confirmed-candidate>|" Dockerfile
```

3. Rebuild:

```bash
docker build -t <image> .
```

On `docker build` failure: restore the backup (`mv Dockerfile.bak Dockerfile`), mark action "failed — build error: `<first error line>`", proceed to next action.

4. Rescan with every scanner in `SUCCEEDED_SCANNERS` — re-run the image mode scan command from `references/scanner-<name>.md` for each, writing to the same output path listed there.

5. For each CVE this action was meant to resolve, report one of:
   - **fixed** — absent in rescan
   - **still present** — present in rescan with same version
   - **newly introduced** — present in rescan but absent in original scan (flag prominently)

6. **Adaptive skip:** after reporting, check remaining confirmed actions. For each, if every CVE it resolves is already absent in this rescan, mark it "fixed by earlier action — skipping" and remove it from the execution queue.

---

## Image Safety Rules

- Never use `latest` as a candidate base image tag. If a scanner or registry returns `latest`, discard it.
- Never recommend a cross-distro base image change without flagging it explicitly. Alpine → Debian, Debian → Ubuntu, etc. are potentially breaking and must be called out.
- Always clean up candidate images (Phase 5c): remove each candidate immediately after scanning, before building the next one.

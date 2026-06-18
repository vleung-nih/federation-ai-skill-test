---
name: dockerfile-twistlock-zero-high
version: 1.0.0
author: essentialsoft
license: MIT
description: "Use when a Docker image from either ECR registry or a local Docker build must be scanned with Twistlock/Prisma Cloud and remediated until Critical and High vulnerabilities are zero. Applies to choosing ECR-vs-local scan mode, Prefect Twistlock deployment runs for ECR images, local twistcli scans, generated Twistlock tokens, VPN/TLS-intercepted package updates, and iterative Dockerfile/base-image/OS-package fixes."
argument-hint: "Provide the repo path and either an ECR image ref or local image tag. Example: 'Scan this repo with Twistlock; ask whether to use ECR or local image, then fix Critical/High findings until zero.'"
user-invocable: true
---

# Dockerfile Twistlock Zero High

## Overview

Scan an image from one of two supported sources, then apply the smallest safe fix, rebuild or reselect the target image as appropriate, and rescan until Critical and High vulnerabilities are zero.

Supported target modes:

1. **ECR registry image** — scan an already built/pushed image reference such as `123456789012.dkr.ecr.us-east-1.amazonaws.com/app:tag`.
2. **Local Docker image** — build or use a local Docker image tag such as `bento-sts:twistlock-candidate`.

ECR mode uses the Prefect deployment pattern from CBIIT `build-sts.yml`: authenticate to Prefect, set the user's workspace, run `twistlock-scan/twistlock-scan` with `image_ref`, wait for completion, and use the deployment output as the scan decision record. Local mode uses `twistcli images scan` against the local Docker image.

This skill is intentionally stricter than a general security review. Do not stop after finding vulnerabilities. Continue the build-scan-fix loop until the policy gate passes or a hard stop is reached.

## Required Inputs

- Repository path. Default to the current working directory.
- Scan target mode: `MODE=ecr` or `MODE=local`.
- For `MODE=ecr`: ECR image reference to scan.
- For `MODE=local`: Dockerfile path, local image tag, and local build command. Prefer an existing repo script such as `backend/build-local-image.sh`; otherwise use `docker build -f <Dockerfile> -t <image> <context>`.
- Twistlock Console URL. Default to `https://twistlock.nci.nih.gov` only when the repo/user context clearly uses NCI Twistlock.
- For `MODE=ecr`: Prefect Cloud login, API URL, and workspace, plus optional `TWISTLOCK_ADDRESS`.
- For `MODE=local`: Twistlock credentials in an env file or environment. Prefer `TWISTLOCK_TOKEN`; otherwise generate a short-lived token from `TWISTLOCK_USERNAME` and `TWISTLOCK_PASSWORD`.

## Safety Rules

- When the user explicitly asks for Twistlock/Prisma Cloud, use Twistlock/Prisma Cloud only. Do not substitute Trivy, Snyk, Docker Scout, or another scanner for the gate.
- Never print, commit, or store secrets, passwords, or generated Twistlock tokens.
- Never suppress, waive, downgrade, hide, or ignore scanner findings as a fix.
- Never assume local build is possible. Ask the user to choose ECR registry scan or local Docker image scan when mode is not explicit.
- Never claim success from Dockerfile inspection. Success requires a fresh Twistlock scan of the selected image.
- For `MODE=local`, prefer the repo build script over an invented build command when one exists.
- For `MODE=ecr`, do not run local `twistcli` against ECR as the primary path. Use the Prefect `twistlock-scan/twistlock-scan` deployment and base the decision on its watched result.
- For `MODE=ecr`, do not edit the local repo before the first Prefect scan unless the user explicitly asks for source remediation first.
- Do not make broad product/runtime changes unless the scan evidence requires it.
- Do not weaken package transport security, such as changing package repositories from HTTPS to HTTP, unless the user explicitly accepts that risk.
- If VPN or TLS interception breaks package manager TLS, use a build-time secret CA only. Do not bake enterprise CA files into the final image.

## Workflow

### 1. Inspect the repo

Run:

```bash
git status --short
find . -name Dockerfile -print
find . -maxdepth 3 -type f -name '*build*image*.sh' -print
```

Record existing user changes. Work with them; do not revert unrelated files.

### 2. Select scan target mode

Determine whether to scan an ECR registry image or a local Docker image before running any build or scan command.

If the user provided an ECR image ref, set:

```text
MODE=ecr
IMAGE_REF=<provided ECR image ref>
```

If the user provided a local image tag or explicitly asked to build locally, set:

```text
MODE=local
IMAGE_REF=<local image tag>
```

If the mode is unclear, ask exactly one question:

> Should I scan an ECR registry image, or build/use a local Docker image?

Wait for the answer. Local Docker builds may fail in some environments, so do not default to local when the user has not chosen a mode.

For `MODE=ecr`, ask for the ECR image ref if missing:

> What ECR image reference should I scan? Example: `123456789012.dkr.ecr.us-east-1.amazonaws.com/app:tag`

For `MODE=local`, ask for the local image tag if missing. Default to `<repo-name>:twistlock-candidate` only after the user chooses local mode.

### 3. Validate scan credentials

Credential requirements depend on mode.

For `MODE=ecr`, validate Prefect access:

- `PREFECT_API_URL`
- Prefect workspace selected or known
- Either an existing Prefect login or `PREFECT_API_KEY`
- Optional `TWISTLOCK_ADDRESS`

Check common env file locations without printing values:

```bash
for f in .env backend/.env deploy/.env scripts/.env; do
  [ -f "$f" ] && echo "$f"
done
```

If Prefect credentials are absent, guide the user to log in directly with the Prefect CLI. Do not ask the user to paste secrets into chat.

Use the Prefect Cloud API URL provided by the user or repo. For the NCI workspace used in this workflow, the API URL may be:

```bash
export PREFECT_API_URL="https://api.prefect.cloud/api/accounts/90cb3bf5-1af1-44fa-8a6d-a1f111368e02/workspaces/5dd67daa-115c-40e2-92ad-8d6776766257"
```

Prefer direct user login when no API key is already configured:

```bash
export PREFECT_API_URL="https://api.prefect.cloud/api/accounts/90cb3bf5-1af1-44fa-8a6d-a1f111368e02/workspaces/5dd67daa-115c-40e2-92ad-8d6776766257"
uv run prefect cloud login
```

The command may open a browser or print a login URL. Ask the user to complete login themselves, then continue only after they confirm login completed.

If the user already has `PREFECT_API_KEY` exported in their shell or provided by CI, log in non-interactively:

```bash
uv run prefect cloud login --key "$PREFECT_API_KEY" --workspace "<account>/<workspace>"
```

Do not assume Prefect credentials live in `backend/.env`; that is a repo-specific exception, not the default workflow.

If the workspace is unknown, ask:

> Which Prefect Cloud workspace should I use for the Twistlock scan deployment? Example: `<account>/<workspace>`

Set the workspace when the CLI requires the account/workspace slug:

```bash
uv run prefect cloud workspace set --workspace "<account>/<workspace>"
```

Confirm the deployment is available:

```bash
uv run prefect deployment inspect twistlock-scan/twistlock-scan
```

If `uv` or Prefect is unavailable, follow the CBIIT workflow pattern:

```bash
uv pip install --system "prefect==3.3.4"
```

For `MODE=local`, validate Twistlock access:

Before scanning, verify credentials exist in either the environment or a repo-local env file.

Accepted variables:

- `TWISTLOCK_TOKEN`
- `TWISTLOCK_USERNAME`
- `TWISTLOCK_PASSWORD`
- `TWISTLOCK_ADDRESS` (optional)

Check common env file locations without printing values:

```bash
for f in .env backend/.env deploy/.env scripts/.env; do
  [ -f "$f" ] && echo "$f"
done
```

Load the selected env file only inside the command that needs it:

```bash
set -a
. backend/.env
set +a
```

Credential paths:

- If `TWISTLOCK_TOKEN` is present, use it directly.
- If `TWISTLOCK_TOKEN` is absent but `TWISTLOCK_USERNAME` and `TWISTLOCK_PASSWORD` are present, generate a short-lived token in memory or pass the username/password to `twistcli` when supported.
- If neither path is available, guide the user to add credentials to a repo-local env file or their shell environment, then retry the credential preflight before scanning. Do not ask the user to paste secrets into chat.

Recommended repo-local `.env` entries:

```dotenv
TWISTLOCK_USERNAME=<your Twistlock username>
TWISTLOCK_PASSWORD=<your Twistlock password>
TWISTLOCK_ADDRESS=https://twistlock.nci.nih.gov
```

Tell the user to add the real values directly on their machine, not in chat. After they confirm the file or environment has been updated, re-check only whether the variables are set; never print their values.

### 4. Identify local build command (MODE=local only)

Prefer repo scripts. For example:

```bash
backend/build-local-image.sh bento-sts:twistlock-candidate
```

If no script exists, infer the Docker context from the Dockerfile location:

```bash
docker build -f backend/Dockerfile -t bento-sts:twistlock-candidate backend
```

If Docker context matters, use the same context the repo script uses. Do not switch to Colima or another context unless the repo script or user explicitly does so.

Skip this step for `MODE=ecr`.

### 5. Build or verify the image

For `MODE=local`, run the selected build command. If it fails:

- Missing Docker daemon access: request permission and rerun.
- Base image pull DNS/TLS failure: diagnose the local Docker/VPN context before editing the Dockerfile.
- Package manager TLS failure inside the build: see "VPN and CA handling".

For `MODE=ecr`, do not build locally. Confirm the image reference is syntactically valid and proceed to the Prefect Twistlock deployment. If the deployment cannot access the ECR image, stop and report the image-access blocker.

### 6. Capture OS/package evidence

Override the entrypoint when needed:

```bash
docker run --rm --entrypoint sh <image> -c 'cat /etc/os-release; apk list --installed 2>/dev/null | grep -E "^(openssl|libssl3|libcrypto3)-" || true; dpkg-query -W openssl "libssl3*" 2>/dev/null || true'
```

Save the important OS and package versions in the final response.

For `MODE=ecr`, local OS/package evidence may be unavailable before the scan. Use Prefect/Twistlock output as the package evidence source.

### 7. Generate a Twistlock token when needed (MODE=local only)

Skip this step for `MODE=ecr`; Prefect deployment authentication is handled by Prefect credentials. If `MODE=local` and `TWISTLOCK_TOKEN` is absent but username/password are available, generate a token in memory only:

```bash
set -a
. backend/.env
set +a

AUTH_JSON=$(python3 - <<'PY'
import json, os
print(json.dumps({
    "username": os.environ["TWISTLOCK_USERNAME"],
    "password": os.environ["TWISTLOCK_PASSWORD"],
}))
PY
)

TOKEN=$(curl -k -sS -X POST "${TWISTLOCK_ADDRESS:-https://twistlock.nci.nih.gov}/api/v1/authenticate" \
  -H "Content-Type: application/json" \
  -d "$AUTH_JSON" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token", ""), end="")')
```

Never echo `TOKEN`.

### 8. Run Twistlock image scan

Use the mode-specific scan runner.

#### MODE=ecr: run Prefect Twistlock deployment

This is the primary path for images already pushed to ECR. It mirrors the CBIIT `build-sts.yml` workflow.

Prerequisites:

- Prefect is authenticated.
- Correct Prefect workspace is selected.
- Deployment `twistlock-scan/twistlock-scan` exists in that workspace.
- `jq` is available.

Run:

```bash
mkdir -p .twistlock-runs/baseline

IMAGE_REF="<ecr-image-ref>"
if [ -n "${TWISTLOCK_ADDRESS:-}" ]; then
  PARAMS=$(jq -n \
    --arg image_ref "$IMAGE_REF" \
    --arg twistlock_address "$TWISTLOCK_ADDRESS" \
    '{image_ref: $image_ref, twistlock_address: $twistlock_address}')
else
  PARAMS=$(jq -n \
    --arg image_ref "$IMAGE_REF" \
    '{image_ref: $image_ref}')
fi

printf '%s\n' "$PARAMS" > .twistlock-runs/baseline/prefect-params.json

uv run prefect deployment run twistlock-scan/twistlock-scan \
  --params "$PARAMS" \
  --watch \
  --watch-interval 30 \
  > .twistlock-runs/baseline/prefect-twistlock.stdout \
  2> .twistlock-runs/baseline/prefect-twistlock.stderr
```

The watched Prefect run is the scan of record for ECR mode. Read the run output and any linked report/artifacts it prints. Use those results to decide whether the Critical/High gate passed.

If the Prefect run fails:

- Authentication/workspace error: ask the user to log in or provide the correct workspace.
- Deployment not found: stop and report that `twistlock-scan/twistlock-scan` is unavailable in the selected workspace.
- Image access error: stop and report the ECR image reference/access blocker.
- Twistlock permission error: stop and report the Twistlock permission blocker.

#### MODE=local: run local twistcli image scan

Use the repo-local `./twistcli` if present; otherwise locate a compatible `twistcli`.

```bash
mkdir -p .twistlock-runs/baseline

./twistcli images scan \
  --address "${TWISTLOCK_ADDRESS:-https://twistlock.nci.nih.gov}" \
  --user "$TWISTLOCK_USERNAME" \
  --token "$TOKEN" \
  --details \
  --output-file .twistlock-runs/baseline/twistcli-results.json \
  <image> \
  > .twistlock-runs/baseline/twistcli.stdout \
  2> .twistlock-runs/baseline/twistcli.stderr
```

If the scanner returns `403 ... custom-compliance ... policyComplianceCustomRules`, credentials are valid but the account lacks a permission `twistcli` requires. Stop and report that permission blocker.

### Local twistcli details

For local scans, prefer a native `twistcli` binary compatible with the host:

1. Repo-local `./twistcli`
2. User-provided scanner path
3. A known local native scanner path, if present, such as `/Users/yoos4/PycharmProjects/twistlock-scanner/twistcli` on macOS

Do not use a Linux `twistcli` binary directly on macOS. Do not switch to a privileged scanner container merely to work around a host binary mismatch, because that can expose repo-local credentials and Docker socket access more broadly than needed.

When scanning a local Docker image, prefer scanning by image ID and pass the Docker socket explicitly:

```bash
set -a
. .env
set +a

USER_VALUE="${TWISTLOCK_USERNAME:-}"
PASS_VALUE="${TWISTLOCK_PASSWORD:-}"
ADDR_VALUE="${TWISTLOCK_ADDRESS:-https://twistlock.nci.nih.gov}"
IMG_ID=$(docker image inspect "$IMAGE_REF" --format "{{.Id}}")

"$TWISTCLI" images scan \
  --address "$ADDR_VALUE" \
  --user "$USER_VALUE" \
  --password "$PASS_VALUE" \
  --docker-address unix:///var/run/docker.sock \
  --details \
  --output-file .twistlock-runs/baseline/twistcli-results.json \
  "$IMG_ID" \
  > .twistlock-runs/baseline/twistcli.stdout \
  2> .twistlock-runs/baseline/twistcli.stderr
```

### 9. Extract the gate result

For `MODE=ecr`, read `.twistlock-runs/baseline/prefect-twistlock.stdout`, Prefect run links, and any report path printed by the deployment.

For `MODE=local`, read scanner stdout and identify:

```text
Vulnerabilities found for image <image>: total - N, critical - C, high - H, medium - M, low - L
```

Gate:

- Pass: `critical - 0, high - 0`
- Fail: any Critical or High finding

If using JSON output, handle empty result arrays defensively. Some Twistlock JSON reports use `null` instead of `[]` when there are no vulnerabilities:

```bash
jq -r '(.results[0].vulnerabilities // [])[] | select((.severity|ascii_downcase) == "critical" or (.severity|ascii_downcase) == "high")' \
  .twistlock-runs/baseline/twistcli-results.json
```

Group Critical/High findings by package, installed version, and fixed version. Fix package groups, not individual CVEs, when they share the same root cause.

Also inspect High/Critical compliance results when the Twistlock output reports compliance findings. They are not CVEs, but they can still fail an image security gate. A common Docker CIS High is "Image should be created with a non-root user"; the minimal Dockerfile fix is usually to chown copied runtime artifacts and add a numeric non-root `USER`, for example:

```dockerfile
COPY --from=builder --chown=10001:10001 /app/output /app/output
USER 10001
```

### 10. Apply the smallest safe fix

Prefer fixes in this order:

1. Compatible base image patch/minor tag already carrying the fixed OS package.
2. Distro package update from the same distro channel.
3. Narrow dependency patch/minor update.

Do not switch distro families unless trying base-image candidates shows the current family cannot reach the fixed package safely. Candidate switches can introduce more Critical/High findings.

For `MODE=ecr`, local repo changes can only affect future images. After applying a Dockerfile or dependency fix, the user must rebuild/push a new ECR image or switch to `MODE=local` for validation. Ask which validation path to use. If they choose ECR validation, ask for the new ECR image ref and rerun the Prefect deployment.

For `MODE=local`, rebuild the local image and rescan it.

### 11. VPN and CA handling

If package manager TLS fails inside Docker build on VPN, use a BuildKit secret CA rather than HTTP repositories or a permanent CA file.

Example Dockerfile pattern:

```dockerfile
# syntax=docker/dockerfile:1.6
FROM python:3.14-alpine

RUN --mount=type=secret,id=nci_ca,target=/usr/local/share/ca-certificates/nci-ca.crt \
    update-ca-certificates && \
    apk update && apk upgrade --no-cache && \
    apk add --no-cache 'openssl>=3.5.7'
RUN update-ca-certificates --fresh
```

Example build script pattern:

```sh
#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
image_name="${1:-app:local}"
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
ca_cert="${NCI_CA_CERT:-$repo_dir/.twistlock-runs/nci-ca.pem}"

if [ -f "$ca_cert" ]; then
    docker build --secret "id=nci_ca,src=$ca_cert" -t "$image_name" -f "$script_dir/Dockerfile" "$script_dir"
else
    docker build -t "$image_name" -f "$script_dir/Dockerfile" "$script_dir"
fi
```

Create `.twistlock-runs/nci-ca.pem` only from a trusted local keychain or user-provided CA. Treat it as a local artifact, not application source.

If Maven, DNF, APK, or another package manager fails with a self-signed or intercepted certificate error, diagnose the local trust/VPN context before changing dependencies. Do not add insecure repository URLs or commit trust-store bypasses. If a full rebuild is temporarily blocked but a previously built application artifact is available, it is acceptable to build a clearly marked final-stage-only verification image to validate runtime hardening with Twistlock. Report that limitation explicitly; do not pretend it was a clean full source rebuild.

### 12. Rebuild/reselect and rescan

After each fix:

```bash
<build-command>
<twistlock-scan-command>
```

For `MODE=ecr`, replace `<build-command>` with the user's remote build/push process, or ask the user for the new ECR image ref before rescanning through Prefect.

Repeat until Critical and High are zero or a hard stop is reached.

## Hard Stops

Stop and report clearly when:

- Twistlock credentials cannot generate a token.
- Prefect credentials or workspace are missing for `MODE=ecr`.
- Prefect deployment `twistlock-scan/twistlock-scan` is unavailable in the selected workspace.
- `twistcli` requires permissions the account does not have.
- User does not provide either an ECR image ref or permission to build/use a local Docker image.
- `MODE=ecr` is selected but no new ECR image is available after a source fix.
- The required fixed version is unavailable from the distro/vendor channel.
- The next fix requires an unsupported major runtime upgrade.
- Build succeeds only by weakening transport security.
- The same Critical/High finding remains after two reasonable attempts.

## Completion Report

Return:

```text
Dockerfile:
Build command:
Image:
Image ID:
OS:
Important package versions:
Twistlock artifact:

Baseline Critical/High:
Final Critical/High:
Remaining findings:
Files changed:
Validation:
```

Only say the gate passed after the final scan shows `critical - 0, high - 0`.

## Local Artifact Hygiene

For local Docker builds, keep scanner artifacts and secrets out of the Docker context. Add or verify `.dockerignore` entries such as:

```dockerignore
.env
.git/
.twistlock-runs/
target/
```

If the Dockerfile uses `COPY . .`, consider ignoring `Dockerfile` too when Dockerfile-only changes should not invalidate expensive application dependency build layers. Do this only when the Dockerfile itself is not needed inside the application build context.

---
name: dockerfile-twistlock-zero-high
version: 1.0.0
author: essentialsoft
license: MIT
description: "Use when a Docker image from either ECR registry or a local Docker build must be scanned with Twistlock/Prisma Cloud twistcli and remediated until Critical and High vulnerabilities are zero. Applies to choosing ECR-vs-local scan mode, repo build scripts, generated Twistlock tokens, VPN/TLS-intercepted package updates, and iterative Dockerfile/base-image/OS-package fixes."
argument-hint: "Provide the repo path and either an ECR image ref or local image tag. Example: 'Scan this repo with Twistlock; ask whether to use ECR or local image, then fix Critical/High findings until zero.'"
user-invocable: true
---

# Dockerfile Twistlock Zero High

## Overview

Scan an image from one of two supported sources, then apply the smallest safe fix, rebuild or reselect the target image as appropriate, and rescan until Critical and High vulnerabilities are zero.

Supported target modes:

1. **ECR registry image** — scan an already built/pushed image reference such as `123456789012.dkr.ecr.us-east-1.amazonaws.com/app:tag`.
2. **Local Docker image** — build or use a local Docker image tag such as `bento-sts:twistlock-candidate`.

This skill is intentionally stricter than a general security review. Do not stop after finding vulnerabilities. Continue the build-scan-fix loop until the policy gate passes or a hard stop is reached.

## Required Inputs

- Repository path. Default to the current working directory.
- Scan target mode: `MODE=ecr` or `MODE=local`.
- For `MODE=ecr`: ECR image reference to scan.
- For `MODE=local`: Dockerfile path, local image tag, and local build command. Prefer an existing repo script such as `backend/build-local-image.sh`; otherwise use `docker build -f <Dockerfile> -t <image> <context>`.
- Twistlock Console URL. Default to `https://twistlock.nci.nih.gov` only when the repo/user context clearly uses NCI Twistlock.
- Twistlock credentials in an env file or environment. Prefer `TWISTLOCK_TOKEN`; otherwise generate a short-lived token from `TWISTLOCK_USERNAME` and `TWISTLOCK_PASSWORD`.

## Safety Rules

- Never print, commit, or store secrets, passwords, or generated Twistlock tokens.
- Never suppress, waive, downgrade, hide, or ignore scanner findings as a fix.
- Never assume local build is possible. Ask the user to choose ECR registry scan or local Docker image scan when mode is not explicit.
- Never claim success from Dockerfile inspection. Success requires a fresh Twistlock scan of the selected image.
- For `MODE=local`, prefer the repo build script over an invented build command when one exists.
- For `MODE=ecr`, do not edit the local repo before the first scan unless the user explicitly asks for source remediation first.
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

### 3. Validate Twistlock credentials

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
- If `TWISTLOCK_TOKEN` is absent but `TWISTLOCK_USERNAME` and `TWISTLOCK_PASSWORD` are present, generate a short-lived token in memory.
- If neither path is available, stop and ask the user to add credentials to an env file or environment. Do not ask the user to paste secrets into chat.

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

For `MODE=ecr`, do not build locally. Confirm the image reference is syntactically valid and proceed to the Twistlock scan. If the scanner or registry cannot access the ECR image, stop and report the image-access blocker.

### 6. Capture OS/package evidence

Override the entrypoint when needed:

```bash
docker run --rm --entrypoint sh <image> -c 'cat /etc/os-release; apk list --installed 2>/dev/null | grep -E "^(openssl|libssl3|libcrypto3)-" || true; dpkg-query -W openssl "libssl3*" 2>/dev/null || true'
```

Save the important OS and package versions in the final response.

For `MODE=ecr`, local OS/package evidence may be unavailable before the scan. Use Twistlock output as the package evidence source.

### 7. Generate a Twistlock token when needed

If `TWISTLOCK_TOKEN` is absent but username/password are available, generate a token in memory only:

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

Use the repo-local `./twistcli` if present; otherwise locate a compatible `twistcli`.

For both modes, the scan command uses `twistcli images scan`. The image argument differs:

- `MODE=ecr`: use the ECR image reference.
- `MODE=local`: use the local image tag.

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

### 9. Extract the gate result

Read scanner stdout and identify:

```text
Vulnerabilities found for image <image>: total - N, critical - C, high - H, medium - M, low - L
```

Gate:

- Pass: `critical - 0, high - 0`
- Fail: any Critical or High finding

Group Critical/High findings by package, installed version, and fixed version. Fix package groups, not individual CVEs, when they share the same root cause.

### 10. Apply the smallest safe fix

Prefer fixes in this order:

1. Compatible base image patch/minor tag already carrying the fixed OS package.
2. Distro package update from the same distro channel.
3. Narrow dependency patch/minor update.

Do not switch distro families unless trying base-image candidates shows the current family cannot reach the fixed package safely. Candidate switches can introduce more Critical/High findings.

For `MODE=ecr`, local repo changes can only affect future images. After applying a Dockerfile or dependency fix, the user must rebuild/push a new ECR image or switch to `MODE=local` for validation. Ask which validation path to use.

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

### 12. Rebuild/reselect and rescan

After each fix:

```bash
<build-command>
<twistlock-scan-command>
```

For `MODE=ecr`, replace `<build-command>` with the user's remote build/push process, or ask the user for the new ECR image ref before rescanning.

Repeat until Critical and High are zero or a hard stop is reached.

## Hard Stops

Stop and report clearly when:

- Twistlock credentials cannot generate a token.
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

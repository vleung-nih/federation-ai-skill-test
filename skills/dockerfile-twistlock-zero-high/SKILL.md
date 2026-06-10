---
name: dockerfile-twistlock-zero-high
version: 1.0.0
author: essentialsoft
license: MIT
description: "Use when a Dockerfile-built local image must be scanned with Twistlock/Prisma Cloud twistcli and remediated until Critical and High vulnerabilities are zero. Applies to local Docker builds, repo build scripts, VPN/TLS-intercepted package updates, generated Twistlock tokens, and iterative Dockerfile/base-image/OS-package fixes."
argument-hint: "Provide the repo path and optional image tag. Example: 'Use this skill to build backend/Dockerfile, scan bento-sts:twistlock-candidate, and fix Critical/High findings until zero.'"
user-invocable: true
---

# Dockerfile Twistlock Zero High

## Overview

Build the repository Dockerfile image locally, scan the exact built image with Twistlock/Prisma Cloud `twistcli`, apply the smallest safe Dockerfile fix, rebuild, and rescan until Critical and High vulnerabilities are zero.

This skill is intentionally stricter than a general security review. Do not stop after finding vulnerabilities. Continue the build-scan-fix loop until the policy gate passes or a hard stop is reached.

## Required Inputs

- Repository path. Default to the current working directory.
- Dockerfile path. Prefer the path named by the user; otherwise search for `Dockerfile`.
- Local image tag. Default to `<repo-name>:twistlock-candidate`.
- Local build command. Prefer an existing repo script such as `backend/build-local-image.sh`; otherwise use `docker build -f <Dockerfile> -t <image> <context>`.
- Twistlock Console URL. Default to `https://twistlock.nci.nih.gov` only when the repo/user context clearly uses NCI Twistlock.
- Twistlock credentials in an env file or environment. Prefer `TWISTLOCK_TOKEN`; otherwise generate a short-lived token from `TWISTLOCK_USERNAME` and `TWISTLOCK_PASSWORD`.

## Safety Rules

- Never print, commit, or store secrets, passwords, or generated Twistlock tokens.
- Never suppress, waive, downgrade, hide, or ignore scanner findings as a fix.
- Never claim success from Dockerfile inspection. Success requires a fresh scan of the newly built image.
- Prefer the repo build script over an invented build command when one exists.
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

### 2. Identify build command

Prefer repo scripts. For example:

```bash
backend/build-local-image.sh bento-sts:twistlock-candidate
```

If no script exists, infer the Docker context from the Dockerfile location:

```bash
docker build -f backend/Dockerfile -t bento-sts:twistlock-candidate backend
```

If Docker context matters, use the same context the repo script uses. Do not switch to Colima or another context unless the repo script or user explicitly does so.

### 3. Build the image

Run the selected build command. If it fails:

- Missing Docker daemon access: request permission and rerun.
- Base image pull DNS/TLS failure: diagnose the local Docker/VPN context before editing the Dockerfile.
- Package manager TLS failure inside the build: see "VPN and CA handling".

### 4. Capture OS/package evidence

Override the entrypoint when needed:

```bash
docker run --rm --entrypoint sh <image> -c 'cat /etc/os-release; apk list --installed 2>/dev/null | grep -E "^(openssl|libssl3|libcrypto3)-" || true; dpkg-query -W openssl "libssl3*" 2>/dev/null || true'
```

Save the important OS and package versions in the final response.

### 5. Generate a Twistlock token when needed

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

### 6. Run Twistlock local image scan

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

### 7. Extract the gate result

Read scanner stdout and identify:

```text
Vulnerabilities found for image <image>: total - N, critical - C, high - H, medium - M, low - L
```

Gate:

- Pass: `critical - 0, high - 0`
- Fail: any Critical or High finding

Group Critical/High findings by package, installed version, and fixed version. Fix package groups, not individual CVEs, when they share the same root cause.

### 8. Apply the smallest safe fix

Prefer fixes in this order:

1. Compatible base image patch/minor tag already carrying the fixed OS package.
2. Distro package update from the same distro channel.
3. Narrow dependency patch/minor update.

Do not switch distro families unless trying base-image candidates shows the current family cannot reach the fixed package safely. Candidate switches can introduce more Critical/High findings.

### 9. VPN and CA handling

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

### 10. Rebuild and rescan

After each fix:

```bash
<build-command>
<twistlock-scan-command>
```

Repeat until Critical and High are zero or a hard stop is reached.

## Hard Stops

Stop and report clearly when:

- Twistlock credentials cannot generate a token.
- `twistcli` requires permissions the account does not have.
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


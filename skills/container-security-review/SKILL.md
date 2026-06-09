---
name: container-security-review
version: 1.0.0
author: Chao Zhang
license: MIT
description: "Use when the user asks to review, scan, or check CVEs either before image build (source/dependency prebuild mode) or on a built Docker image. Detects available scanners, runs them in mode-appropriate commands, triages findings by severity and category, presents a prioritised action plan, and applies confirmed fixes with rescan validation. Standalone — no dependency on other installed skills."
argument-hint: "Provide either an image reference (e.g. myapp:latest) for image mode, or ask for prebuild/source scan mode (no image required). Optionally specify a scanner (e.g. 'use Trivy')."
user-invocable: true
---

# Container Security Review

## Overview

This skill shifts CVE detection left: instead of waiting for server-side CI/CD scans, it runs locally before push. It supports two execution modes:
- **Image mode**: scan a built image tag.
- **Prebuild mode**: scan the source/dependency manifests before image build.

It operates in sequential phases. Never skip ahead — each phase produces inputs the next phase requires.

---

## Load References

Use the Read tool to load these files at the indicated points. They contain the detailed rules each phase delegates to.

**Always load before Phase 3 (read now if not yet loaded):**
- `skills/container-security-review/references/normalise-and-triage.md`
- `skills/container-security-review/references/action-plan.md`
- `skills/container-security-review/references/fix-execution.md`

**Load after Phase 0 determines MODE:**
- `skills/container-security-review/references/mode-image.md` — if `MODE=image`
- `skills/container-security-review/references/mode-prebuild.md` — if `MODE=prebuild`

**Load before running each scanner (Phase 2) — only the ones you will use:**
- `skills/container-security-review/references/scanner-trivy.md`
- `skills/container-security-review/references/scanner-snyk.md`
- `skills/container-security-review/references/scanner-grype.md`
- `skills/container-security-review/references/scanner-docker-scout.md`
- `skills/container-security-review/references/scanner-twistlock.md`

---

## Phase 0: Mode Selection

Determine execution mode before any scan command.

- **Prebuild mode triggers**: user says "before build", "prebuild", "scan codebase", "scan source", "scan dependencies", or does not provide an image and asks to scan locally before image creation.
- **Image mode trigger**: user provides an image reference, or explicitly asks to scan an image.

If mode is ambiguous, ask one question:
> "Should I run prebuild source/dependency scan (no image required) or image scan (requires image tag)?"

Use this exact question for ambiguous asks such as "scan my app for CVEs."

Record mode as `MODE=prebuild` or `MODE=image`. Then load the mode reference file (see Load References above) and continue.

---

## Phase 1: Input Validation

### 1a. Confirm image reference

If `MODE=image` and the user has not provided an image reference, ask:
> "Which Docker image should I scan? (e.g. `myapp:latest` or `gcr.io/project/myapp:sha`)"

Wait for their reply before continuing.

### 1b. Confirm the image is accessible

- If `MODE=image`: follow `references/mode-image.md` § "Phase 1b".
- If `MODE=prebuild`: skip this step.

### 1c. Identify scanner preference

Check the user's message for explicit scanner references: "use Trivy", "run Snyk", "with Twistlock/Prisma", "use Grype", "Docker Scout". Recognised names: `trivy`, `snyk`, `grype`, `docker scout`, `twistlock`, `prisma`, `twistcli`.

- If a scanner is explicitly named: record it as the **mandatory scanner**. Go to Phase 2b.
- If no scanner is named: proceed with **auto-detect mode**. Go to Phase 2c.

---

## Phase 2: Scanner Detection & Execution

### 2a. Auth prerequisite checks

Before running any scanner, verify its prerequisite:

| Scanner | Prerequisite check |
|---|---|
| Trivy | None — runs unauthenticated |
| Snyk | `echo $SNYK_TOKEN` is non-empty, OR `snyk whoami` exits 0 |
| Grype | None — runs unauthenticated |
| Docker Scout | `docker scout version` exits 0 |
| Twistlock/Prisma | `echo $PRISMA_URL` is non-empty |

### 2b. Mandatory scanner mode (user named a scanner)

Load `references/scanner-<name>.md` for the named scanner before proceeding.

1. If `MODE=prebuild` and the scanner does not support prebuild: stop per instructions in that scanner's reference file.
2. Run its detection command. If not installed: stop — "Scanner `<name>` is not installed. Install it from: `<URL from ## Install in the scanner reference file>`."
3. Run auth check (§ 2a). On failure: prompt for the missing credential; retry once. Still failing: stop.
4. Run the scan command (from the scanner reference file). Capture output to the output path listed there.
   - Non-zero exit: for Snyk, apply the exit-code exception in `references/scanner-snyk.md`; for all others, stop — "`<scanner>` scan failed: `<error>`."
5. Set `SUCCEEDED_SCANNERS = [<scanner>]`. Proceed to Phase 3.

### 2c. Auto-detect mode (no scanner specified)

Probe in order: **Trivy → Snyk → Grype → Docker Scout → Twistlock/Prisma**

Load each scanner's reference file before probing it. Maintain `SUCCEEDED_SCANNERS` (initially empty).

For each scanner:
1. Run its detection command. Non-zero or not found → skip silently.
2. Run auth check (§ 2a). Fails → skip with warning: ⚠ `<scanner>` found but cannot run: `<reason>`. Skipping.
3. Run the scan command (from the scanner reference file). Non-zero → for Snyk, apply exit-code exception; for others, skip with warning: ⚠ `<scanner>` scan failed: `<error>`. Skipping.
4. Success → collect JSON output; append scanner name to `SUCCEEDED_SCANNERS`.

After probing all scanners:
- Zero succeeded: stop, list all warnings, and include the install URL from `## Install` in each scanner's reference file.
- One or more succeeded: proceed to Phase 3 with all collected outputs and `SUCCEEDED_SCANNERS`.

---

## Phase 3 & 4: Normalisation, Merge, and Triage

Follow `references/normalise-and-triage.md` in full.

---

## Phase 5: Candidate Base Image Discovery

- If `MODE=image` and Phase 4 produced at least one CRITICAL/HIGH OS/base-image finding: follow `references/mode-image.md` § "Phase 5".
- If `MODE=prebuild`: follow `references/mode-prebuild.md` § "Phase 4b" — do not run Phase 5.

---

## Phase 6: Action Plan

Follow `references/action-plan.md` in full.

---

## Phase 7: Fix Execution

Apply each confirmed fix action in numbered order.

### 7a. Hard stop check (per action, before attempting the fix)

| Condition | Hard stop applies to |
|---|---|
| No Dockerfile accessible | OS fix actions (image mode only) |
| `fixed_in` is null for this CVE | Any fix action |
| Zero scanners available to rescan | Any fix action |

If a hard stop condition is met: mark the action "skipped — `<reason>`", proceed to the next confirmed action.

### 7b. OS / base-image fix

- If `MODE=image`: follow `references/mode-image.md` § "Phase 7b".
- If `MODE=prebuild`: follow `references/mode-prebuild.md` § "Phase 7b".

### 7c. App dependency fix

Follow `references/fix-execution.md` in full.

### 7d. Per-action result reporting

After each fix action completes (or is skipped), report:

```
Action [N] result: <fixed | failed | skipped>
  Fixed CVEs:            <list>
  Still present CVEs:    <list>
  Newly introduced CVEs: <list> ← investigate before pushing
  Reason (if skipped/failed): <text>
```

Then proceed to the next confirmed action.

---

## Phase 8: Completion Output

```
Review complete for <target>

Scanners used:     <list>

Fixed:             <N> CVEs  — <list of CVE IDs>
Remaining:         <M> CVEs  — <list of CVE IDs + why still present>
No fix available:  <K> CVEs  — <list of CVE IDs>
Skipped:           <S> CVEs  — <list of CVE IDs, reason per item>
Newly introduced:  <P> CVEs  — <list of CVE IDs> ← INVESTIGATE BEFORE PUSHING

Next steps:
<list any CRITICAL/HIGH CVEs that remain unfixed with suggested manual actions>
```

Count definitions:
- **Fixed:** CVEs absent in the final rescan that were present in the initial scan.
- **Remaining:** CVEs confirmed present in the final rescan after an attempted fix.
- **No fix available:** CVEs where `fixed_in` was null, or no candidate base image reduced the finding, or (in `MODE=prebuild`) remediation requires a later image-mode run.
- **Skipped:** CVEs where a hard stop was hit, or the user did not select the fix action.
- **Newly introduced:** CVEs present in the final rescan absent in the initial scan. Never suppress these.

If the user selected "no" in Phase 6: Fixed = 0, Remaining = all CRITICAL/HIGH findings.

If `MODE=prebuild`: follow `references/mode-prebuild.md` § "Phase 8" for the extra next step.

---

## Safety Rules

### Universal rules

- **Never apply any fix before user confirmation.** Phase 6 must complete and the user must select actions before Phase 7 begins.
- **Never suppress or ignore a finding without noting it explicitly.** Every finding must appear somewhere in the output (action list, awareness table, or skipped list).
- **Never claim a CVE is fixed without rescan evidence.** A CVE is only "fixed" if it is absent in a rescan of the rebuilt image (`MODE=image`) or the rescanned source directory (`MODE=prebuild`).
- **Never substitute a different scanner than the one the user explicitly chose.** If the user said "use Twistlock" and Twistlock cannot run, prompt for the missing prerequisite; do not silently fall back.

### Mode-specific rules

See `references/mode-image.md` § "Image Safety Rules" and `references/mode-prebuild.md` § "Prebuild Safety Rule".

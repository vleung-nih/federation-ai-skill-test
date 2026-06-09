# Container Security Review — Usage Guide

## Modes

The skill operates in two modes. Choose based on where you are in your build cycle:

| Mode | When to use | Docker required? |
|------|-------------|-----------------|
| **Prebuild** | Catch CVEs in source manifests before building | No |
| **Image** | Validate a built image before pushing to registry | Yes |

Run them in sequence for full coverage: prebuild first, fix what you can, build, then image scan.

---

## Prerequisites

**Both modes:**
- At least one scanner installed (mode-specific support):
  - **Prebuild + Image:** [Trivy](https://aquasecurity.github.io/trivy/), [Grype](https://github.com/anchore/grype), or [Snyk](https://docs.snyk.io/snyk-cli/install-or-update-the-snyk-cli)
  - **Image only:** Docker Scout (`docker scout`) or Twistlock/Prisma (`twistcli`)
- Claude Code open in your project workspace with the `container-security-review` skill installed
- For Snyk: `SNYK_TOKEN` set in your shell

**Image mode only:**
- Docker is running and the image is built or pullable

---

## Case 1 — Prebuild source scan

Scan your source manifests and dependencies before building the image. No Docker required.

**Step 1.** From your project root, invoke the skill in chat:

```
scan my source for CVEs
```

or equivalently:

```
prebuild scan
```

```
scan dependencies before build
```

**Step 2.** The skill runs `trivy fs`, `grype dir:.`, and/or `snyk test` against your project directory, merges results, and presents a numbered action plan focused on app dependency fixes:

- **CRITICAL / HIGH** — numbered fix actions (manifest edits)
- **MEDIUM / LOW** — awareness table

> Note: prebuild mode does not perform base-image remediation. If OS/base-image findings are surfaced, they are carried with an "image-mode remediation required after build" note.

**Step 3.** Answer `no` at the prompt if you only want the report:

```
Proceed with the action plan? (all / select numbers / no)
→ no
```

---

## Case 2 — Pre-deploy image scan

Scan a built image before pushing to your registry.

**Step 1.** Build your image:

```bash
docker build -t myapp:latest .
```

**Step 2.** Invoke the skill in chat:

```
review CVEs for image myapp:latest
```

To target a specific scanner:

```
review CVEs for image myapp:latest, use Trivy
```

**Step 3.** The skill auto-detects installed scanners, runs them, merges and deduplicates findings, and presents a numbered action plan:

- **CRITICAL / HIGH** — fix actions: base-image updates and app dependency upgrades
- **MEDIUM / LOW** — awareness table

**Step 4.** Answer `no` at the prompt if you only want the report with no changes applied.

---

## Case 3 — Fix identified CVEs

Applies to both modes. Continue from the action plan produced in Case 1 or Case 2, or re-run the scan to get a fresh plan.

**Step 1.** Review the numbered action plan. Each item is one fix action (not one CVE — a single action may resolve multiple CVEs).

**Step 2.** Confirm which fixes to apply at the prompt:

| Input | Effect |
|-------|--------|
| `all` | Apply every numbered action |
| `1 3` or `1,2,3` | Apply only those action numbers |
| `1-3` | Apply a range |
| `no` | Apply nothing |

**Step 3.** The skill applies each confirmed fix:

- **OS / base-image CVEs** *(image mode only)* — updates the `FROM` line in your Dockerfile to a safer candidate tag, rebuilds the image, and rescans to confirm
- **App dependency CVEs** — updates the version pin in your manifest (`requirements.txt`, `package.json`, `go.mod`, etc.) and rescans:
  - *Image mode:* rebuilds the image then rescans
  - *Prebuild mode:* rescans source directly — no Docker build needed

**Step 4.** After each fix you see a per-action result:

```
Action [1] result: fixed
  Fixed CVEs:            CVE-2024-1111, CVE-2024-9999
  Still present CVEs:    (none)
  Newly introduced CVEs: (none)
```

> **Important:** Any **Newly introduced CVEs** are flagged prominently. Investigate before pushing — do not treat them as noise.

**Step 5.** Final summary:

```
Review complete for myapp:latest

Fixed:            3 CVEs  — CVE-2024-1111, CVE-2024-9999, CVE-2025-0101
Remaining:        1 CVE   — CVE-2025-4040 (no fix available upstream)
No fix available: 1 CVE   — CVE-2025-4040
Skipped:          0 CVEs
Newly introduced: 0 CVEs

Next steps:
- CVE-2025-4040: no package-level patch exists. Monitor vendor advisory.
- After building the image, run image mode to cover OS/base-image CVEs.
```

The last next-step line appears in prebuild mode to remind you to follow up with an image scan after build.

---

## Partial environments

Not all workflows have source code, a Dockerfile, and a built image all at once. Here is what the skill can and cannot fix in each partial scenario.

### Image only (no Dockerfile, no source code)

The skill runs a full scan and produces a complete findings report and action plan. No fixes are applied.

| CVE type | What happens |
|---|---|
| OS / base-image | Listed as **No fix available — Dockerfile not found** in the action plan. Phase 5 (base image discovery) is skipped entirely. |
| App dependency | Fix commands would need to edit manifest files that don't exist locally. The skill attempts the fix, fails, and reports `failed — manifest file not found`. |

**Use the action plan output as a remediation ticket** for whoever owns the source repo. It includes the exact package, current version, fixed version, and ecosystem fix command for every finding.

### Dockerfile present, no source code

OS/base-image CVEs are fully remediable. App dependency CVEs are not.

| CVE type | What happens |
|---|---|
| OS / base-image | Phase 5 runs: reads the `FROM` line, builds and scans candidate base images, recommends the best tag. Phase 7b updates the `FROM` line, rebuilds, and rescans to confirm. **Fully automated.** |
| App dependency | Manifest files (`requirements.txt`, `package.json`, etc.) are baked into the image layers and not present on disk. Fix commands fail with a build or file-not-found error and are reported as `failed`. |

**Net result:** OS surface is cleaned up; app dependency CVEs remain and are documented in Phase 8 under `Remaining` with the exact fix commands to apply once source is available.

---

## Recommended workflow

```
prebuild scan → fix app dep CVEs → docker build → image scan → fix OS/app CVEs → push
```

---

## Tips

- To fix only CRITICAL items now and defer HIGH/MEDIUM, pass just the CRITICAL action numbers (e.g. `1 2`). Re-run the skill later for the rest.
- If your image is in a private registry, ensure `docker pull <image>` works in your shell before invoking image mode — credentials are read from `~/.docker/config.json`.
- For Snyk, set `SNYK_TOKEN` before starting Claude Code:
  ```bash
  export SNYK_TOKEN=<your-token>
  ```
- Docker Scout and Twistlock/Prisma are supported in image mode only. Use Trivy, Grype, or Snyk for prebuild scans.

# Prebuild Mode — Phase Notes

Loaded by `container-security-review` when `MODE=prebuild`. Read this file after Phase 0 determines the mode.

---

## Phase 4b — OS/Base-Image Findings in Prebuild Mode

OS/base-image CRITICAL/HIGH findings cannot be remediated in prebuild mode. Do not trigger Phase 5. Carry each such finding as:
> "image-mode remediation required after build"

Include them in the Phase 6 action plan with this note (once, at the top of the fix list):
> "Base-image upgrade actions require image mode after build."

---

## Phase 7b — OS Fix in Prebuild Mode

Do not attempt OS fix actions. Mark every OS action:
> skipped — base-image remediation is image-mode only.

---

## Phase 7c — Rescan in Prebuild Mode

After editing an app dependency manifest, do **not** run `docker build`. Instead, re-run only the prebuild scanner commands for each scanner listed in `SUCCEEDED_SCANNERS`:

| Scanner | Prebuild rescan command |
|---|---|
| Trivy | `trivy fs --format json --output /tmp/csr-prebuild-trivy.json .` |
| Snyk | `snyk test --all-projects --json-file-output=/tmp/csr-prebuild-snyk.json` |
| Grype | `grype dir:. -o json > /tmp/csr-prebuild-grype.json` |

Snyk-specific: do not treat non-zero exit as failure. If the expected JSON output exists and parses, treat as success and continue CVE comparison.

---

## Phase 8 — Prebuild Extra Next Step

After the completion summary, always append:
> "After building the image, run image mode to cover OS/base-image CVEs."

---

## Prebuild Safety Rule

Never run `docker build`, `docker pull`, or `docker image inspect` unless the user explicitly asks to switch to image mode.

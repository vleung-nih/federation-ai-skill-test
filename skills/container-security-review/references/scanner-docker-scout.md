# Docker Scout — Detection and Scan Commands

## Install

https://docs.docker.com/scout/install/

## Detection

```bash
docker scout version
```

## Auth Prerequisite

`docker scout version` exits 0.

## Scan Commands

| Mode | Command | Output path |
|---|---|---|
| Image | `docker scout cves <image> --format json > /tmp/csr-scout.json` | `/tmp/csr-scout.json` |
| Prebuild | Not supported | — |

## Prebuild Mode Restriction

**In Phase 2b (mandatory scanner):** If the user explicitly named Docker Scout and `MODE=prebuild`, stop immediately:
> ⚠ Docker Scout supports image scanning only. Cannot run in prebuild mode. Switch to image mode or choose Trivy, Snyk, or Grype.

**In Phase 2c (auto-detect):** Skip with warning:
> ⚠ Docker Scout supports image scanning only. Skipping in prebuild mode.

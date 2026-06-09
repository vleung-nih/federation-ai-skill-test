# Snyk — Detection, Scan Commands, and Exit-Code Handling

## Install

https://docs.snyk.io/snyk-cli/install-or-update-the-snyk-cli

## Detection

```bash
snyk version
```

## Auth Prerequisite

`echo $SNYK_TOKEN` is non-empty, OR `snyk whoami` exits 0.

## Scan Commands

| Mode | Command | Output path |
|---|---|---|
| Image | `snyk container test <image> --json > /tmp/csr-snyk.json` | `/tmp/csr-snyk.json` |
| Prebuild | `snyk test --all-projects --json-file-output=/tmp/csr-prebuild-snyk.json` | `/tmp/csr-prebuild-snyk.json` |

## Exit-Code Exception

`snyk container test` and `snyk test` exit non-zero when vulnerabilities are found — this is expected behaviour, not a scanner failure.

- Treat non-zero as failure **only** if the expected JSON output file is missing or contains invalid JSON.
- If valid JSON is produced, treat the scan as success and continue.

This exception applies during the initial scan (Phase 2) and during rescan (Phase 7c).

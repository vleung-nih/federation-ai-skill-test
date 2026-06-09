# Twistlock / Prisma — Detection and Scan Commands

## Install

https://docs.prismacloud.io/en/classic/compute-admin-guide/tools/twistcli-scan-images

## Detection

```bash
twistcli version
```

## Auth Prerequisite

`echo $PRISMA_URL` is non-empty.

## Scan Commands

| Mode | Command | Output path |
|---|---|---|
| Image | `twistcli images scan --address $PRISMA_URL --output-file /tmp/csr-twistlock.json <image>` | `/tmp/csr-twistlock.json` |
| Prebuild | Not supported | — |

## Prebuild Mode Restriction

**In Phase 2b (mandatory scanner):** If the user explicitly named Twistlock/Prisma and `MODE=prebuild`, stop immediately:
> ⚠ Twistlock/Prisma supports image scanning only. Cannot run in prebuild mode. Switch to image mode or choose Trivy, Snyk, or Grype.

**In Phase 2c (auto-detect):** Skip with warning:
> ⚠ Twistlock/Prisma supports image scanning only. Skipping in prebuild mode.

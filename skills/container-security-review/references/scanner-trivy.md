# Trivy — Detection and Scan Commands

## Install

https://aquasecurity.github.io/trivy/latest/getting-started/installation/

## Detection

```bash
trivy version
```

## Auth Prerequisite

None — runs unauthenticated.

## Scan Commands

| Mode | Command | Output path |
|---|---|---|
| Image | `trivy image --format json --output /tmp/csr-trivy.json <image>` | `/tmp/csr-trivy.json` |
| Prebuild | `trivy fs --format json --output /tmp/csr-prebuild-trivy.json .` | `/tmp/csr-prebuild-trivy.json` |

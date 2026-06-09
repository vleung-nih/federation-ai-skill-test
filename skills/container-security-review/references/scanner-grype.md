# Grype — Detection and Scan Commands

## Install

https://github.com/anchore/grype#installation

## Detection

```bash
grype version
```

## Auth Prerequisite

None — runs unauthenticated.

## Scan Commands

| Mode | Command | Output path |
|---|---|---|
| Image | `grype <image> -o json > /tmp/csr-grype.json` | `/tmp/csr-grype.json` |
| Prebuild | `grype dir:. -o json > /tmp/csr-prebuild-grype.json` | `/tmp/csr-prebuild-grype.json` |

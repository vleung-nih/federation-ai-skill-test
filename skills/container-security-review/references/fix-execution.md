# Phase 7c — App Dependency Fix

Determine the ecosystem from the finding's normalised location field (Phase 3b).

---

## Ecosystem Fix Commands

**npm / yarn** (location contains `package.json`, `package-lock.json`, or `yarn.lock`):
```bash
cd <directory-containing-package.json>
npm install <package>@<fixed_in>
# commit the updated lock file along with package.json changes
```

**pip** (location contains `requirements.txt`, `pyproject.toml`, or `setup.cfg`):
- Edit the version pin in the manifest: change `<package>==<current>` to `<package>==<fixed_in>` (or `>=<fixed_in>` if the manifest uses range constraints).
- If `pip-compile` is available (`which pip-compile` exits 0): run `pip-compile` in the same directory.

**Maven** (location contains `pom.xml`):
- Edit `pom.xml`: find the `<dependency>` block for `<artifactId><package></artifactId>` and update `<version>` to `<fixed_in>`.

**Go** (location contains `go.mod` or `go.sum`):
```bash
cd <directory-containing-go.mod>
go get <module>@<fixed_in>
go mod tidy
```

**Other ecosystems:** identify the manifest file from the normalised location path. Edit the version constraint for `<package>` to `<fixed_in>` directly.

---

## Transitive Dependency Handling

If `<package>` does not appear as a direct dependency in the manifest:

1. Check whether any direct dependency can be upgraded to a version that transitively pulls `<fixed_in>` or later. If yes, upgrade that direct dependency instead.
2. If not, pin the transitive dependency directly (add an explicit entry in the manifest at `<fixed_in>`). Note in the completion output: "Pinned transitive dependency `<package>` to `<fixed_in>` directly."

---

## Rescan After Manifest Edit

- **`MODE=image`**: rebuild the image then rescan.
  ```bash
  docker build -t <image> .
  ```
  Then re-run the image scan command from `references/scanner-<name>.md` (image mode scan command row) for each scanner in `SUCCEEDED_SCANNERS`.

- **`MODE=prebuild`**: do not run `docker build`. Follow `mode-prebuild.md` § "Phase 7c" — re-run prebuild scanner commands only.

Then report each CVE as **fixed** / **still present** / **newly introduced** per Phase 7d format.

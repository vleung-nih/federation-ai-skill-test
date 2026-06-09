# Phase 3 & 4 — Normalisation, Merge, and Triage

---

## Phase 3: Result Normalisation & Merge

Parse every Phase 2 output file. Build one merged findings list.

### 3a. Severity normalisation

Apply to every finding before merging:

1. If a severity label is present: uppercase it (`critical` → `CRITICAL`).
2. If only a CVSS score is present (no label): map it:
   - 9.0–10.0 → `CRITICAL`
   - 7.0–8.9 → `HIGH`
   - 4.0–6.9 → `MEDIUM`
   - 0.1–3.9 → `LOW`
3. If neither label nor score is present: mark severity `UNKNOWN` and include in the awareness table only.

Canonical order for "highest severity" comparisons: `CRITICAL > HIGH > MEDIUM > LOW > UNKNOWN`.

### 3b. Location normalisation

For each finding, assign a single normalised location value using the first available:

1. **Layer digest** — the image layer digest string (e.g. `sha256:abc123def456`), if the scanner emits it.
2. **Canonical package path** — the absolute filesystem path of the package manifest or binary (e.g. `/usr/lib/python3/dist-packages/requests-2.28.0.dist-info`).
3. **Package manager scope** — ecosystem identifier + lockfile path (e.g. `npm:/app/package-lock.json`, `pip:/app/requirements.txt`).
4. **Wildcard** — if the scanner omits location entirely, use `*`. A finding with location `*` merges with any other finding that shares the same `(CVE ID, package name, package version)` regardless of location. Note "location unavailable" on the merged finding.

### 3c. Deduplication key

The dedup key is: `(CVE ID, package name, package version, normalised location)`

For every finding across all scanner outputs:
- If the key does not exist in the merged list: add it with its normalised severity and scanner name.
- If the key already exists: update with the highest normalised severity; append the scanner name to the "reported by" list.

### 3d. Merged finding fields

Each entry in the merged list carries:

| Field | Source |
|---|---|
| `cve_id` | Scanner output |
| `severity` | Highest normalised severity across all scanners |
| `package_name` | Scanner output |
| `package_version` | Scanner output |
| `location` | Normalised per 3b |
| `fixed_in` | Scanner output; `null` if no fix version reported |
| `reported_by` | List of scanner names that flagged this finding |

---

## Phase 4: Triage

Classify each merged finding into a category, then bucket by severity.

### 4a. Category classification

In `MODE=prebuild`, classify all findings as **App dependency** unless scanner metadata clearly indicates an OS package manager.

**OS / base-image** — assign if any of the following is true:
- The package manager field is a distro package manager: `apt`, `dpkg`, `rpm`, `apk`, `yum`, `zypper`, `tdnf`, `microdnf`
- The package location path starts with `/usr/`, `/lib/`, `/bin/`, `/sbin/`, `/etc/`

**App dependency** — assign if any of the following is true:
- The package manager field is a language ecosystem: `npm`, `yarn`, `pip`, `pip3`, `poetry`, `maven`, `gradle`, `go`, `cargo`, `nuget`, `composer`, `bundler`, `gem`
- The location path contains `/app/`, `/src/`, `/home/`, or a language-specific manifest filename (`package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`)

**Unknown** — if classification cannot be determined: flag for manual review, do not propose a fix action, include in the awareness table with "category unknown — manual review required."

### 4b. Severity bucketing

| Severity | Category | Next step |
|---|---|---|
| CRITICAL / HIGH | OS / base-image | `MODE=image`: Trigger Phase 5. `MODE=prebuild`: Do not run Phase 5 — see `mode-prebuild.md` § "Phase 4b". |
| CRITICAL / HIGH | App dependency | Collect `fixed_in` from merged finding; include in Phase 6 action list |
| MEDIUM / LOW | Any | Include in Phase 6 awareness table only |
| Any | Unknown | Include in Phase 6 awareness table with "manual review" note |

A finding with `fixed_in = null` and severity CRITICAL/HIGH: include in the Phase 6 action list but mark "no fix available — for awareness."

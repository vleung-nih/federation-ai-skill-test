# container-security-review

Shifts CVE detection left by scanning locally before push. Supports two modes:

- **Prebuild mode** — scan source/dependency manifests before building an image (no Docker required)
- **Image mode** — scan a built image tag before pushing to a registry

See [USAGE.md](./USAGE.md) for invocation examples and workflow.

---

## Installation

Install via the skills CLI from any project where Claude Code is active:

```bash
npx skills add essentialsoft/agentskills@container-security-review
```

To skip the confirmation prompt:

```bash
npx skills add essentialsoft/agentskills@container-security-review -y
```

After installing, check for updates at any time:

```bash
npx skills check
npx skills update
```

---

## Skill Structure

`SKILL.md` is the entry point. Detailed rules live in `references/` and are loaded on demand via the Read tool.

### File Map

```
SKILL.md                        ← entry: phases 0–2 orchestration, 7a/7d, 8, universal safety rules
USAGE.md                        ← user-facing instructions
references/
  mode-image.md                 ← Phase 1b, 5 (base image discovery), 7b (OS fix), image safety rules
  mode-prebuild.md              ← prebuild notes for Phase 4b, 7b, 7c, 8, prebuild safety rule
  normalise-and-triage.md       ← Phase 3 (normalisation & merge) + Phase 4 (triage)
  action-plan.md                ← Phase 6 (action plan format + confirmation parsing)
  fix-execution.md              ← Phase 7c (app dependency ecosystem fixes)
  scanner-trivy.md              ← detection, image + prebuild scan commands
  scanner-snyk.md               ← detection, image + prebuild scan commands, exit-code exception
  scanner-grype.md              ← detection, image + prebuild scan commands
  scanner-docker-scout.md       ← detection, image-only command + prebuild restriction
  scanner-twistlock.md          ← detection, image-only command + prebuild restriction
```

### Loading Order

```
Skill invoked
  └─ Read normalise-and-triage.md, action-plan.md, fix-execution.md  (always, upfront)
  └─ Phase 0: determine MODE
       ├─ Read mode-image.md      (if MODE=image)
       └─ Read mode-prebuild.md   (if MODE=prebuild)
  └─ Phase 2: for each scanner about to run
       └─ Read scanner-<name>.md
```

---

## Extending the Skill

### Adding a New Scanner

1. Create `references/scanner-<name>.md` with: detection command, auth prerequisite, scan commands table (image + prebuild or image-only), output paths, and any mode restrictions.
2. Add it to the probe order in `SKILL.md` Phase 2c (auto-detect).
3. Add its auth prerequisite to the Phase 2a table in `SKILL.md`.
4. Add it to the Load References list in `SKILL.md`.

### Adding a New Mode

1. Create `references/mode-<name>.md` with: mode-specific phase overrides, safety rules.
2. Add a trigger rule to Phase 0 in `SKILL.md`.
3. Add a `Read mode-<name>.md` entry to the Load References block.
4. Add mode branches in Phase 1b, 4b, 5, 7b, 7c, 8, and Safety Rules in `SKILL.md`.

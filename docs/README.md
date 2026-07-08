# CCDI Federation AI Copilot — Manual QA

Manual test tracking for the **ccdi-federation-ai-copilot** skill, kept in this repo alongside the automated batch eval pipeline.

## What lives here

| File | Purpose |
|------|---------|
| [CCDI-Federation-AI-Copilot-Test-Execution.csv](./CCDI-Federation-AI-Copilot-Test-Execution.csv) | **Source of truth for results** — all test cases, prompts, Pass/Partial/Fail, `tester_notes`, `eval_id` crosswalk |
| [CCDI-Federation-AI-Copilot-Manual-Tests.md](./CCDI-Federation-AI-Copilot-Manual-Tests.md) | **Copy-paste runbook** — readable prompts grouped by pillar (Setup, Usability, Workflow, Golden, Reference story AC, etc.) |

## Manual QA vs automated batch

| Track | Where | When to use |
|-------|-------|-------------|
| **Automated batch** | `npm run eval:federation` → `eval/{timestamp}/dashboard.html` | Regression on 24 scored cases in `skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx` |
| **Manual desktop** | This folder (CSV + Manual-Tests) | Setup (L-01), multi-turn (MT-01), golden probes (G-01), story AC reference rows (QB/EX/SC-REF), cases excluded from batch |

**Crosswalk:** CSV column `eval_id` ↔ Excel column `maps_to_csv` ↔ case `id` in `ccdi-federation-ai` `evals/evals.json`.

## Typical workflow

1. Run batch: `npm run eval:federation` from repo root.
2. Open `eval/{timestamp}/dashboard.html` for automated pass/fail.
3. For manual-only rows, copy prompts from Manual-Tests into Codex (reasoning **High**).
4. Record results in the CSV (`result`, `tester_notes`).
5. For batch-covered rows, note dashboard outcome when filling CSV.
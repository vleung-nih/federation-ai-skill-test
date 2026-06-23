# skill-test example — CCDI Federation AI Copilot

Excel test cases ported from the federation QA eval catalog (`evals/evals.json`).

## Files

| File | Description |
|------|-------------|
| `ccdi-federation-copilot-mvp.xlsx` | 27 eval cases — `id`, `prompt`, `expected_output` (+ optional metadata columns) |
| `build_ccdi_test_xlsx.py` | Regenerate xlsx when `evals.json` changes |

## Prerequisites

1. **Codex CLI on PATH** — verify with `which codex` and `codex --version`.
2. **Run from the agentskills git repo root** — Codex `exec` requires a trusted directory (a git repo). Running from `~` or outside the repo fails with `Not inside a trusted directory`.
3. **`ccdi-federation-ai-copilot` skill installed** — e.g. `npx skills add CBIIT/ccdi-federation-ai -a codex -g`.
4. **Reasoning effort = High** in Codex settings (recommended for federation evals).

## Run the pipeline

From the `agentskills` repo root:

```bash
cd /Users/leungvw/ai/agentskills

node skills/skill-test/scripts/llm_eval_pipeline.js \
  skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx \
  --concurrency 2
```

Outputs land in `eval/{timestamp}/` with `dashboard.html`.

## Codex app invocation (required behavior)

When using `$skill-test` in the Codex app for this workbook:

| Rule | Why |
|------|-----|
| Run from **agentskills git repo root** only | Pipeline requires `.git` + `skills/skill-test/scripts/` |
| **Never** copy skill-test to `work/` or patch sandbox to `read-only` | Causes DNS failures on `federation.ccdi.cancer.gov` |
| If approval reviewer blocks CLI, **ask user to approve** `danger-full-access` | Do not workaround with read-only |
| Do not report old `eval/` as a new run unless user asked report-only | |

**User approval example:**

> Approve running the full skill-test pipeline with danger-full-access from agentskills repo root. Do not copy or patch scripts.

Click **Approve** when prompted for the `node llm_eval_pipeline.js` command. If denied, stop and ask — do not fall back to read-only.

## Sandbox behavior (CLI vs desktop)

The **Codex desktop app** and **`codex exec` CLI** are not the same environment. `read-only` blocks outbound network (DNS errors on live `curl`/API calls), so **all test-case runs use `--sandbox danger-full-access`** so agents can reach the federation API when they attempt a live fetch.

Requirements:

- Run from the **agentskills git repo root** (Codex trusted-directory check).
- **Codex CLI on PATH**.

The Excel `requires_live_api` column is metadata only (which cases expect live API in the answer). Judge scoring still uses `read-only` (no live API needed).

## Regenerate Excel

```bash
pip install openpyxl   # once
python3 skills/skill-test/example/build_ccdi_test_xlsx.py
```

## Source of truth

- Prompts and expected results: [`evals/evals.json`](../../../../federation/ccdi-federation-ai/skills/ccdi-federation-ai-copilot/evals/evals.json)
- Manual QA crosswalk: [`CCDI-Federation-AI-Copilot-Test-Execution.csv`](../../../../federation/AI%20applications/QA/CCDI-Federation-AI-Copilot-Test-Execution.csv) (stored in Excel `maps_to_csv` column only — not in judge `expected_output`)
- Tune federation pass criteria via `expected_output` in this Excel and `LLM_as_a_judge.prompt` in skill-test (no separate QA rubrics doc)

## Not in this Excel

- Terminal setup (L-01, L-02, L-04) — `npx skills` commands, not Codex prompts
- Compare without-skill (B-01–B-05) — requires a second run without the skill
- CSV rows without a matching `eval_id`

## Notes

- Each prompt includes `/ccdi-federation-ai-copilot` so Codex routes through the skill.
- Golden cases include baseline numbers in `expected_output` for the built-in LLM judge.
- MT-01 is included as a single combined multi-turn prompt; skill-test runs one Codex call per row (best-effort).

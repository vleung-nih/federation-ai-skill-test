# skill-test example — CCDI Federation AI Copilot

Excel test cases ported from the federation QA eval catalog (`evals/evals.json`).

## Files

| File | Description |
|------|-------------|
| `ccdi-federation-copilot-mvp.xlsx` | 26 automated batch cases — `id`, `prompt`, `expected_output` (+ optional metadata columns) |
| `build_ccdi_test_xlsx.py` | Regenerate xlsx when `evals.json` changes |

## Prerequisites

1. **Codex CLI on PATH** — verify with `which codex` and `codex --version`.
2. **Run from the federation-ai-skill-test git repo root** — Codex `exec` requires a trusted directory (a git repo). Running from `~` or outside the repo fails with `Not inside a trusted directory`.
3. **`ccdi-federation-ai-copilot` skill installed** — e.g. `npx skills add CBIIT/ccdi-federation-ai --skill ccdi-federation-ai-copilot -a codex -g -y` (verify with `npx skills list -g`; files at `~/.agents/skills/ccdi-federation-ai-copilot/`).
4. **Reasoning effort = High** in Codex settings (recommended for federation evals).

## Run the pipeline

From the `federation-ai-skill-test` repo root:

```bash
cd /Users/leungvw/ai/federation-ai-skill-test

node skills/skill-test/scripts/llm_eval_pipeline.js \
  skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx \
  --concurrency 2
```

Outputs land in `eval/{timestamp}/` with `dashboard.html`.

**`eval/sample-run/`** is a static demo folder (2 placeholder cases). The pipeline **does not** use it for stages 2–4; it picks the **newest timestamp folder by modification time** (excluding `sample-run`).

## Single-case runs

Create a one-row workbook from the MVP sheet, then run the pipeline on it:

```bash
python3 << 'PY'
from openpyxl import load_workbook, Workbook
CASE_ID = "neuroblastoma-by-node"  # change as needed
src = "skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx"
dst = f"skills/skill-test/example/{CASE_ID}-only.xlsx"
wb = load_workbook(src)
ws = wb.active
headers = [c.value for c in ws[1]]
out = Workbook()
out_ws = out.active
out_ws.append(headers)
for row in ws.iter_rows(min_row=2, values_only=True):
    if row[0] == CASE_ID:
        out_ws.append(row)
        break
out.save(dst)
print("Wrote", dst)
PY

node skills/skill-test/scripts/llm_eval_pipeline.js \
  skills/skill-test/example/neuroblastoma-by-node-only.xlsx \
  --concurrency 1
```

After Stage 1, confirm the log line `Using run folder: 20260706-XXXXXX` (timestamp), **not** `sample-run`.

## Execution failures vs judge failures

By default the pipeline **continues** after Stage 1 even if some Codex cases exit non-zero (e.g. `security-toxic-flow` killed mid-run). Judge and dashboard still run for all cases with artifacts.

- Dashboard **Exec** column: Codex execution (`PASS` / `FILTER` / `FAIL`)
- Dashboard **Judge** column: LLM-as-judge score (`PASS` / `FAIL`)
- Use `--fail-fast` on the pipeline or test runner to abort when any case fails execution (CI).

```bash
# CI: stop if any Codex case fails
node skills/skill-test/scripts/llm_eval_pipeline.js \
  skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx \
  --concurrency 2 --fail-fast
```

Resume judge + dashboard only (existing run folder):

```bash
node skills/skill-test/scripts/build_judge_prompts.js 20260623-133832
node skills/skill-test/scripts/run_judge_evaluations.js 20260623-133832
node skills/skill-test/scripts/generate_dashboard.js 20260623-133832
```

## Codex app usage

When using `$skill-test` in the Codex app for this workbook, the agent should **run the pipeline command immediately** (see Run the pipeline above). If Codex shows a CLI approval dialog, click **Approve** there — do not ask the user to paste approval text in chat.

| Rule | Why |
|------|-----|
| Run from **federation-ai-skill-test git repo root** only | Pipeline requires `.git` + `skills/skill-test/scripts/` |
| **Never** copy skill-test to `work/` or patch sandbox to `read-only` | Causes DNS failures on `federation.ccdi.cancer.gov` |
| Do not report old `eval/` as a new run unless user asked report-only | |

## Sandbox behavior (CLI vs desktop)

The **Codex desktop app** and **`codex exec` CLI** are not the same environment. `read-only` blocks outbound network (DNS errors on live `curl`/API calls), so **all test-case runs use `--sandbox danger-full-access`** so agents can reach the federation API when they attempt a live fetch.

Requirements:

- Run from the **federation-ai-skill-test git repo root** (Codex trusted-directory check).
- **Codex CLI on PATH**.

The Excel `requires_live_api` column is metadata only (which cases expect live API in the answer). Judge scoring still uses `read-only` (no live API needed).

## Regenerate Excel

```bash
pip install openpyxl   # once
python3 skills/skill-test/example/build_ccdi_test_xlsx.py
```

## Source of truth

- Prompts and expected results: [`evals/evals.json`](../../../../federation/ccdi-federation-ai/skills/ccdi-federation-ai-copilot/evals/evals.json)
- Manual QA crosswalk: [`../../docs/CCDI-Federation-AI-Copilot-Test-Execution.csv`](../../docs/CCDI-Federation-AI-Copilot-Test-Execution.csv) (stored in Excel `maps_to_csv` column only — not in judge `expected_output`)
- Tune federation pass criteria via `expected_output` in this Excel and `LLM_as_a_judge.prompt` in skill-test (no separate QA rubrics doc)

## Not in this Excel

- Terminal setup (L-01, L-02, L-04) — `npx skills` commands, not Codex prompts
- Compare without-skill (B-01–B-05) — requires a second run without the skill
- **Multi-turn MT-01** (`mt-pediatric-leukemia-rnaseq`) — manual desktop only; three prompts in one Codex thread (see QA Manual-Tests § MT-01). Excluded by `multi-turn` tag in `build_ccdi_test_xlsx.py`.
- **Platform-filter red-team S-06 / S-07** (`security-jailbreak-dan`, `security-instruction-override`) — manual red-team only; Codex often blocks with cybersecurity FILTER. Excluded by `platform-filter-risk` tag.
- **Live golden G-07** (`data-footprint-by-source`) — manual desktop only; long live API run. Batch uses plan-only `data-footprint-by-source-plan`. Excluded by `manual-golden` tag.
- CSV rows without a matching `eval_id`

## Notes

- Each prompt includes `/ccdi-federation-ai-copilot` so Codex routes through the skill.
- Golden cases include baseline numbers in `expected_output` for the built-in LLM judge.
- Full eval catalog in `evals.json` is 28 cases; this Excel is the **24-case automated batch** subset (excludes `multi-turn`, `platform-filter-risk`, `manual-golden`).

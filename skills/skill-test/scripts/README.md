# Scripts Folder

This folder contains all pipeline scripts for the LLM Evaluation Pipeline.

## Files

### llm_eval_pipeline.js
Main pipeline orchestrator that coordinates all 4 evaluation stages.

**Usage:**
```bash
# From project root
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js [excelPath] [--concurrency N]

# Or from skill directory
node scripts/llm_eval_pipeline.js ../../../../test_cases.xlsx --concurrency 4
```

**Stages Coordinated:**
1. **Stage 1:** Test Case Execution (`test_case_runner.js`)
2. **Stage 2:** Judge Prompt Generation (`build_judge_prompts.js`)
3. **Stage 3:** Judge Evaluation (`run_judge_evaluations.js`)
4. **Stage 4:** Dashboard Generation (`generate_dashboard.js`)

**Features:**
- ✅ Fail-fast error handling (stops on first failure)
- ✅ Auto-opens dashboard in browser on success
- ✅ Displays output folder structure
- ✅ Prints summary metrics
- ✅ Configurable concurrency for parallel execution

**Exit Codes:**
- `0` — Success
- `1` — Stage 1 (test execution) failed
- `2` — Stage 2 (judge prompt generation) failed
- `3` — Stage 3 (judge evaluation) failed
- `4` — Stage 4 (dashboard generation) failed

## Notes

This folder is self-contained for the JS pipeline stages:
- `llm_eval_pipeline.js`
- `test_case_runner.js`
- `build_judge_prompts.js`
- `run_judge_evaluations.js`
- `generate_dashboard.js`
- `judge_utils.js`
- `codex_runner.js`

Only project inputs/resources are expected at runtime:
- Excel test file (`test_cases.xlsx` or provided path)
- `LLM_as_a_judge.prompt` and `style-rubric.schema.json` (or fallback under `../reference/`)
- Node dependency `xlsx` available from project root

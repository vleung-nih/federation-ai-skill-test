---
name: "skill-test"
slug: "llm-evaluation-pipeline"
description: "Automates end-to-end LLM prompt testing with fail-fast execution, browser dashboards, and Excel input. Executes test cases, runs judge evaluations, and generates interactive reports."
category: "Testing & Evaluation"
tags: ["llm", "testing", "evaluation", "judge", "dashboard", "batch-processing"]
keywords:
  - "llm evaluation"
  - "run test cases"
  - "evaluate prompts"
  - "generate evaluation report"
  - "test llm output"
  - "judge llm response"
  - "batch test"
  - "lm-as-a-judge"
author: "LLM Testing Team"
version: "1.0"
workspace-scoped: true
enabled: true
min-agent-version: "0.1.0"
---

# LLM Evaluation Pipeline Skill

**Domain:** LLM Testing & Evaluation  
**Triggers:** Execute test cases → judge evaluation → dashboard generation  
**Output:** Interactive HTML dashboard + evaluation artifacts + summary metrics

## Overview

This skill automates an end-to-end LLM evaluation pipeline that executes test prompts through an LLM (via Codex CLI), evaluates the outputs using a judge prompt, and generates an interactive HTML dashboard with results.

The workflow processes test cases defined in an Excel file and produces:
- Timestamped run folder with all artifacts
- Judge evaluations for each test case
- HTML dashboard with sortable, collapsible results

## When to Use

- **Batch test LLM responses** against predefined prompts from an Excel file
- **Evaluate output quality** using structured judge scoring (LLM-as-a-Judge pattern)
- **Generate reports** for prompt testing iterations
- **Compare evaluations** across multiple runs via the dashboard

## Input Requirements

### Excel Test Cases File

Create a `.xlsx` file with the following columns (case-insensitive):

| Column | Aliases | Required | Description |
|--------|---------|----------|-------------|
| `id` | `test_id`, `case_id` | ✅ | Unique identifier for the test case |
| `prompt` | `input`, `question` | ✅ | The prompt to send to the LLM |
| `expected_output` | `expected_output`, `expected output`, `expected`, `expected_answer` | ⭕ | (Optional) Ground truth for judge comparison |

**Example:**

```
id          | prompt                                | expected_output
tc-001      | Explain load balancing in 2 sentences | A distribution mechanism...
tc-002      | What is cloud computing?              | Cloud is on-demand computing...
```

### Configuration Files

Preferred in project root (with fallback to this skill's `reference/` folder):

1. **LLM_as_a_judge.prompt** — Template for judge evaluation prompts
2. **style-rubric.schema.json** — JSON Schema for evaluation output structure
3. **Codex CLI** — Must be installed and authenticated (`codex` command on PATH)

## Workflow Stages

```
Excel Input
    ↓
┌─────────────────────────────────────────┐
│ Stage 1: Test Case Execution            │
│ (test_case_runner.js)                   │
│ - Read test cases from Excel            │
│ - Execute via Codex LLM                 │
│ - Save outputs to eval/{timestamp}/     │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 2: Judge Prompt Generation        │
│ (build_judge_prompts.js)                │
│ - Load LLM_as_a_judge.prompt template   │
│ - Generate per-case judge prompts       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 3: Judge Evaluation               │
│ (run_judge_evaluations.js)              │
│ - Execute judge prompts via Codex       │
│ - Validate against schema               │
│ - Save evaluation.json per case         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 4: Dashboard Generation           │
│ (generate_dashboard.js)                 │
│ - Aggregate all artifacts               │
│ - Generate HTML dashboard               │
│ - Produce summary.json                  │
└─────────────────────────────────────────┘
    ↓
Output: dashboard.html + Artifacts
```

## Usage

### Command-Line Invocation

Run the complete pipeline:

```bash
# Using default Excel file (test_cases.xlsx or test_case.xlsx)
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js

# Using explicit Excel file
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js my_test_cases.xlsx

# With concurrency control (4 parallel Codex calls)
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js my_test_cases.xlsx --concurrency 4
```

### Agent Skill Invocation

When called by an agent:

```
User: "Evaluate these test cases against the judge rubric"
  → Skill receives: Excel file path + optional concurrency
  → Executes: All 4 pipeline stages with fail-fast error handling
  → Opens: Dashboard in default browser automatically
  → Returns: Run folder structure + summary metrics + artifact listing
```

### Outputs

All outputs are timestamped and stored in `eval/{YYYYMMDD-HHMMSS}/`:

```
eval/20260617-223400/
├── dashboard.html                    # Main interactive report
├── summary.json                      # Run-level metrics
└── test_case_1/
    ├── output.jsonl                  # Raw LLM response
    ├── meta.json                     # Execution metadata
    ├── judge_prompt.txt              # Generated judge prompt
    └── evaluation.json               # Judge evaluation results
```

#### dashboard.html

Interactive HTML report featuring:
- Sortable table of test cases
- Per-case expandable details
- Judge scores (pass/fail, rubric compliance)
- Filtering and search

##### Dashboard UI Features

**Table Columns (sortable):**
- **Case ID** — Test case identifier
- **Prompt** — Input prompt sent to LLM (truncated in table, full view in details)
- **Status** — Pass/Fail pill indicating overall_pass evaluation
- **Scores** — Displays semantic_match_score, completeness_score, correctness_score

**Expandable Row Details:**
Click any row to reveal:
- **Expected Output** — Ground truth from Excel or meta.json
- **Actual Output** — LLM-generated response extracted from output.jsonl
- **Comparison Summary** — Judge's textual analysis of differences
- **Token Usage** — Input/output token counts (if available from Codex)
- **Evaluation Metadata** — Full JSON evaluation object

**Filter Controls:**
- Sort ascending/descending by any column header
- Filter by pass/fail status
- Search box for case ID or prompt text

#### summary.json

```json
{
  "timestamp": "20260617-223400",
  "total_cases": 10,
  "passed": 8,
  "failed": 2,
  "elapsed_seconds": 45.2,
  "average_score": 0.85
}
```

## Parameters & Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `excelPath` | (positional) | string | `test_cases.xlsx` | Path to Excel test case file |
| `concurrency` | `-c` | integer | `1` | Number of parallel Codex workers |

## Failure Handling

**Fail-fast approach:** Pipeline stops immediately on first stage failure.

- **Missing Excel:** Stops; suggests valid path
- **LLM timeout/error:** Stops; logs Codex error details
- **Judge schema violation:** Stops; indicates schema mismatch
- **Build judge prompts failure:** Stops; check template syntax

**Error codes:**

| Code | Meaning | Recovery |
|------|---------|----------|
| 0 | Success | None needed |
| 1 | Test case execution failed | Check Excel format and Codex CLI |
| 2 | Judge prompt generation failed | Verify `LLM_as_a_judge.prompt` syntax |
| 3 | Judge evaluation failed | Check `style-rubric.schema.json` and judge output |
| 4 | Dashboard generation failed | Check artifacts in run folder |

**On Success:**
- Dashboard automatically opens in default browser
- Output folder structure displayed in terminal
- Run summary metrics printed to console

## Integration Points

### With Azure DevOps / GitHub Actions

```yaml
- name: Run LLM Evaluation Pipeline
  run: |
    node .agent/skills/skill-test/scripts/llm_eval_pipeline.js test_cases.xlsx --concurrency 4
    # Pipeline fails fast on any error; check exit code
    
- name: Upload Dashboard
  if: success()
  uses: actions/upload-artifact@v3
  with:
    name: evaluation-dashboard
    path: eval/*/dashboard.html
```

### With CI/CD Pipelines

Export results for downstream processing:

```bash
# Get summary.json for metrics collection
jq '.passed, .failed' eval/*/summary.json

# List all evaluation.json files for aggregation
find eval -name "evaluation.json" | xargs ...
```

## Common Workflows

### 1. Single Test Run

```bash
# Execute test_cases.xlsx, get dashboard
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js
# Result:
#   - Dashboard opens in browser
#   - eval/20260617-223400/ folder structure displayed
#   - Summary metrics printed to console
```

### 2. Performance Testing (High Concurrency)

```bash
# Run 100 test cases with 8 parallel workers
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js large_test_set.xlsx --concurrency 8
```

### 3. Iterative Prompt Tuning

```bash
# Run 1: Initial prompt
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js version1.xlsx
# Review: eval/20260617-223400/dashboard.html

# Refine prompts...

# Run 2: Improved prompt
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js version2.xlsx
# Compare: eval/20260617-224500/dashboard.html vs previous
```

### 4. Judge Template Customization

To adjust evaluation criteria:
1. Edit `LLM_as_a_judge.prompt` to change judge instructions
2. Update `style-rubric.schema.json` with new rubric fields
3. Re-run: `node .agent/skills/skill-test/scripts/llm_eval_pipeline.js`

## Customization

### Modify Judge Scoring

Edit `style-rubric.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "accuracy": { "type": "number", "minimum": 0, "maximum": 1 },
    "clarity": { "type": "string", "enum": ["poor", "fair", "good", "excellent"] },
    "completeness": { "type": "boolean" }
  }
}
```

### Modify Judge Template

Edit `LLM_as_a_judge.prompt`:

```
You are evaluating the following test case:

ID: {{case_id}}
Prompt: {{prompt}}
Expected Output: {{expected_output}}
Actual Output: {{actual_output}}

Evaluate against the rubric:
1. Does the response answer the prompt?
2. Is it accurate compared to the expected output?
3. Is it clear and well-structured?

Respond in JSON format per the schema.
```

## Dependencies

- **Node.js** (v14+)
- **XLSX library** (`npm install`)
- **Codex CLI** (installed + authenticated)

## Programmatic Usage (Node.js)

If you need to integrate the pipeline into your own Node.js code:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Run the pipeline
  execSync('node .agent/skills/skill-test/scripts/llm_eval_pipeline.js my_test_cases.xlsx --concurrency 4', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  // Access results after successful run
  const latestRun = execSync(
    "ls -1d eval/*/  | tail -1 | xargs basename",
    { encoding: 'utf8' }
  ).trim();
  
  const summary = JSON.parse(
    fs.readFileSync(path.join('eval', latestRun, 'summary.json'), 'utf8')
  );
  console.log(`Pipeline completed: ${summary.passed}/${summary.total_cases} passed`);
  
} catch (error) {
  console.error('Pipeline failed:', error.message);
  process.exit(1);
}
```

**Accessing Evaluation Results:**

```javascript
const fs = require('fs');
const path = require('path');

const runFolder = 'eval/20260617-223400';

// Read summary metrics
const summary = JSON.parse(
  fs.readFileSync(path.join(runFolder, 'summary.json'), 'utf8')
);

// Iterate test case evaluations
const testCases = fs.readdirSync(runFolder)
  .filter(f => f.startsWith('test_case_'))
  .map(tcName => JSON.parse(
    fs.readFileSync(
      path.join(runFolder, tcName, 'evaluation.json'),
      'utf8'
    )
  ));

console.log(`Total cases: ${summary.total_cases}`);
console.log(`Pass rate: ${(summary.passed / summary.total_cases * 100).toFixed(1)}%`);
```

## Performance Tuning

### Choosing Concurrency

The `--concurrency` flag controls how many Codex CLI calls run in parallel.

**Guidelines:**

| Test Cases | Recommended | Max | Notes |
|------------|------------|-----|-------|
| 1-5 | 1 | 2 | Small runs; serial is fine |
| 6-20 | 2-4 | 4 | Moderate; 2-4 workers good |
| 21-50 | 4-6 | 8 | Larger batches; balance |
| 51-100 | 6-8 | 10 | High volume; optimal |
| 100+ | 8-10 | 12+ | Very large; up to 12 |

**Factors:**
- **Codex API rate limits** — Check your plan; high concurrency may hit quota
- **Local CPU/RAM** — Each worker uses ~50MB memory
- **Network bandwidth** — More workers = more concurrent API calls

### Example Performance

```bash
# Small: serial
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js small_batch.xlsx
# ~2 min for 5 cases

# Medium: moderate concurrency
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js medium_batch.xlsx --concurrency 4
# ~5 min for 30 cases

# Large: high concurrency
node .agent/skills/skill-test/scripts/llm_eval_pipeline.js large_batch.xlsx --concurrency 8
# ~12 min for 100 cases
```

## Related Skills

- `ccdi-federation-ai-copilot` — CCDI metadata federation queries (complementary for data cohort testing)
- `typescript-upgrade` — If you need to modernize this pipeline's JavaScript

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Excel file not found" | File doesn't exist at given path | Verify path; use default candidates |
| "Required columns not found" | Wrong column names | Rename to: `id`, `prompt`, `expected_output` |
| "Codex command not found" | CLI not on PATH | Install Codex; verify: `which codex` |
| "Schema validation failed" | Judge output doesn't match schema | Check schema syntax; review judge prompt |
| Empty dashboard | All cases failed | Check Codex logs; verify judge template |

## Example Agent Prompts

Try these prompts with the agent:

1. **"Evaluate my test cases using the LLM evaluation pipeline"**
   - Triggers: Accepts Excel file → Runs full pipeline → Returns dashboard

2. **"Run 50 prompt test cases in parallel with concurrency 4"**
   - Triggers: Parallelizes execution → Aggregates results → Generates report

3. **"Generate an evaluation report for my LLM test suite"**
   - Triggers: Reads Excel → Executes → Evaluates → Dashboards

4. **"Compare my original prompts vs. refined prompts"**
   - Triggers: Runs two Excel files sequentially → Side-by-side dashboard comparison

## Version History

- **v1.0** (2026-06-17): Initial skill creation
  - Full pipeline automation
  - Excel input support
  - Judge evaluation with schema validation
  - Interactive HTML dashboard

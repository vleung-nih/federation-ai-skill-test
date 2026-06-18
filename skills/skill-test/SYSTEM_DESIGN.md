# System Design Document

## 1. Purpose

This system automates LLM-based test execution and evaluation for prompt test cases, then generates an HTML dashboard for analysis.

Primary goals:

- Execute test prompts from Excel in batch.
- Persist raw model traces and metadata per test case.
- Evaluate actual output vs expected output using an LLM judge prompt and output schema.
- Visualize run results in a sortable, collapsible dashboard.

## 2. Scope

In scope:

- Test execution from Excel rows.
- Per-case artifact persistence.
- Judge prompt generation from run artifacts.
- Judge execution and structured scoring output.
- Dashboard generation from run artifacts.

Out of scope:

- Real-time web server deployment.
- Database storage.
- Authentication/authorization management for Codex CLI.

## 3. High-Level Architecture

```mermaid
flowchart TD
  A[Excel Test Cases] --> B[test_case_runner.js]
  B --> C[codex_runner.js]
  C --> D[eval/{timestamp}/{case}/output.jsonl]
  B --> E[eval/{timestamp}/{case}/meta.json]
  B --> F[eval/{timestamp}/summary.json]

  D --> G[build_judge_prompts.js]
  E --> G
  H[LLM_as_a_judge.prompt] --> G
  G --> I[eval/{timestamp}/{case}/judge_prompt.txt]

  I --> J[run_judge_evaluations.js]
  K[style-rubric.schema.json] --> J
  J --> L[eval/{timestamp}/{case}/evaluation.json]

  D --> M[generate_dashboard.js]
  E --> M
  L --> M
  M --> N[eval/{timestamp}/dashboard.html]
```

## 4. Components

### 4.1 test_case_runner.js

Responsibilities:

- Read first sheet from Excel file.
- Resolve columns:
  - id: id, test_id, case_id
  - prompt: prompt, input, question
  - expected output: expected_output, expected output, expected, expected_answer, expected answer
- Execute test cases with configurable concurrency.
- Write per-case and run-level artifacts.

Outputs:

- output.jsonl
- meta.json
- summary.json

### 4.2 codex_runner.js

Responsibilities:

- Execute Codex CLI for one prompt.
- Support sync and async execution APIs.
- Write raw Codex JSONL trace output.

Public functions:

- runCodex(prompt, outJsonlPath)
- runCodexAsync(prompt, outJsonlPath)

### 4.3 judge_utils.js

Responsibilities:

- Shared helper layer for judge prompt/evaluation workflows.
- Run-folder resolution and file-path utilities.
- Agent-message extraction from last two non-empty output lines.
- Prompt-template interpolation.

### 4.4 build_judge_prompts.js

Responsibilities:

- Load judge template and case artifacts.
- Build final prompt per case using:
  - task: test-case folder name
  - expected output: meta.json expectedOutput or expected_output
  - actual output: agent_message text from output.jsonl
- Persist judge_prompt.txt in each case folder.

### 4.5 run_judge_evaluations.js

Responsibilities:

- Build/refresh judge prompt for each case.
- Execute Codex judge with output schema.
- Persist evaluation.json per case.

Command shape per case:

- codex exec "{judge prompt}" --output-schema style-rubric.schema.json -o eval/{timestamp}/{case}/evaluation.json

### 4.6 generate_dashboard.js

Responsibilities:

- Read run folder and aggregate data from:
  - meta.json
  - output.jsonl
  - evaluation.json (if present)
- Extract token usage from turn.completed usage object in output.jsonl.
- Render static dashboard.html with sorting and detail toggles.

Default view:

- Test case name
- Prompt
- overall_pass

Expanded view:

- Expected result
- LLM generated result
- Token usage
- overall_pass
- semantic_match_score
- completeness_score
- correctness_score
- comparison_summary

## 5. Data Contracts

### 5.1 Per-Case Metadata

File: eval/{timestamp}/{case}/meta.json

Key fields:

- id
- prompt
- expectedOutput (or expected_output in legacy runs)
- exitCode
- stderr
- outputPath
- timestamp

### 5.2 Raw Execution Trace

File: eval/{timestamp}/{case}/output.jsonl

Expected key events:

- item.completed with item.type = agent_message (LLM generated result)
- turn.completed with usage object (token counters)

### 5.3 Judge Evaluation Result

File: eval/{timestamp}/{case}/evaluation.json

Expected fields from schema:

- overall_pass
- semantic_match_score
- completeness_score
- correctness_score
- comparison_summary
- additional rubric fields

### 5.4 Run Summary

File: eval/{timestamp}/summary.json

Key fields:

- timestamp
- runRoot
- successCount
- failureCount
- skippedCount
- queuedCases
- concurrency
- totalRows

## 6. Execution Flow

### Step 1: Execute Test Cases

- test_case_runner reads Excel.
- Calls codex_runner for each prompt.
- Writes per-case output and metadata.

### Step 2: Build Judge Prompts

- build_judge_prompts reads output and metadata.
- Creates judge_prompt.txt per case.

### Step 3: Judge Evaluation

- run_judge_evaluations executes Codex judge.
- Writes evaluation.json per case.

### Step 4: Dashboard Generation

- generate_dashboard aggregates case artifacts.
- Writes dashboard.html in run folder.

## 7. Error Handling Strategy

- Missing required input files: throw explicit error.
- No agent message in last two non-empty lines: throw explicit error.
- Missing expected output in meta: throw explicit error for judge stage.
- Missing evaluation.json during dashboard generation: allowed, rendered as N/A.
- Non-zero Codex exit in judge execution: logged and process exits non-zero if any failures.

## 8. Performance and Concurrency

- Test execution supports bounded concurrency to increase throughput.
- Trade-off: higher concurrency increases CPU/network usage and may hit provider rate limits.
- Current execution model is process-level concurrency via multiple Codex invocations.

## 9. Security and Compliance Considerations

- Inputs and outputs are file-based local artifacts.
- Do not place secrets in prompt files or metadata files.
- Codex CLI authentication remains external to this system.

## 10. Operational Usage

Typical run sequence:

1. node test_case_runner.js <excel> --concurrency 4
2. node run_judge_evaluations.js <timestamp>
3. node generate_dashboard.js <timestamp>

Artifacts are grouped by run timestamp under eval/<timestamp> for repeatability and auditability.

## 11. Future Enhancements

- Add trend dashboard across multiple timestamps.
- Add CSV export from dashboard data.
- Add retry/backoff policy for Codex CLI failures.
- Add optional HTTP server mode for dashboard hosting.
- Add token/cost estimation summaries by run.

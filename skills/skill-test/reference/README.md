# Reference Folder

This folder contains configuration and template files required by the LLM Evaluation Pipeline.

## Files

### LLM_as_a_judge.prompt
Judge evaluation template that defines the LLM evaluation criteria.

**Variables:**
- `{{task}}` — The original test case task/prompt
- `{{expected_output}}` — Ground truth output for comparison
- `{{actual_output}}` — LLM-generated output to evaluate

**Usage:**
- Customize this template to adjust evaluation criteria
- Modify scoring guidelines, penalty rules, or pass conditions
- Example: "Ignore formatting differences" or "Penalize hallucinations"

### style-rubric.schema.json
JSON Schema that validates judge evaluation outputs.

**Key Properties:**
- `overall_pass` (boolean) — Final pass/fail verdict
- `score` (0-100) — Overall evaluation score
- `semantic_match_score` (0-100) — Semantic equivalence score
- `completeness_score` (0-100) — Information completeness
- `correctness_score` (0-100) — Factual correctness
- `comparison_summary` (string) — Human-readable analysis
- `checks` (array) — Detailed per-check results

**Usage:**
- Add or remove properties to match your evaluation needs
- Adjust minimum/maximum bounds for scores
- Add custom scoring dimensions (e.g., "tone_match", "relevance")
- Validate judge output format during evaluation stage

## Integration with Pipeline

These files are copied from your project root by the skill. If you modify them in the project root, regenerate the skill files to update the reference folder.

**Paths in commands:**
```bash
# Reference files are in: .agent/skills/skill-test/reference/
# Use them with: node .agent/skills/skill-test/scripts/llm_eval_pipeline.js
```

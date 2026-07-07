# federation-ai-skill-test

LLM-as-a-Judge batch evaluation pipeline for Agent Skills. Runs Excel test cases through Codex CLI, scores responses with a judge prompt, and generates an interactive HTML dashboard.

Primary use case: regression testing for the [CCDI Federation AI Copilot](https://github.com/CBIIT/ccdi-federation-ai) skill.

## Prerequisites

- Node.js 18+
- [Codex CLI](https://github.com/openai/codex) on PATH (`which codex`)
- Target skill installed (e.g. `ccdi-federation-ai-copilot`)

## Quick start

```bash
cd /Users/leungvw/ai/federation-ai-skill-test
npm install

node skills/skill-test/scripts/llm_eval_pipeline.js \
  skills/skill-test/example/ccdi-federation-copilot-mvp.xlsx \
  --concurrency 2
```

Or use the npm script:

```bash
npm run eval:federation
```

Outputs land in `eval/{timestamp}/` (dashboard.html, summary.json, per-case artifacts). A reference sample run is committed at `eval/sample-run/`.

## Repository layout

| Path | Purpose |
|------|---------|
| `skills/skill-test/SKILL.md` | Agent skill definition and invocation rules |
| `skills/skill-test/scripts/` | Pipeline orchestrator, test runner, judge, dashboard |
| `skills/skill-test/reference/` | Judge prompt template and rubric schema |
| `skills/skill-test/example/` | Federation MVP test catalog (xlsx) and builder script |
| `eval/sample-run/` | Example pipeline output (2 cases) |

## Documentation

- [skills/skill-test/SKILL.md](skills/skill-test/SKILL.md) — full pipeline workflow and Codex app rules
- [skills/skill-test/example/README.md](skills/skill-test/example/README.md) — federation batch run details
- [skills/skill-test/SYSTEM_DESIGN.md](skills/skill-test/SYSTEM_DESIGN.md) — architecture

## Install as an agent skill

```bash
npx skills add vleung-nih/federation-ai-skill-test@skill-test -a codex -g -y
```

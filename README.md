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

Outputs land in `eval/{timestamp}/` (dashboard.html, summary.json, per-case artifacts). The `eval/` folder is gitignored (local runs only).

## Repository layout

| Path | Purpose |
|------|---------|
| `skills/skill-test/SKILL.md` | Agent skill definition and invocation rules |
| `skills/skill-test/scripts/` | Pipeline orchestrator, test runner, judge, dashboard |
| `skills/skill-test/reference/` | Judge prompt template and rubric schema |
| `skills/skill-test/example/` | Federation MVP test catalog (xlsx) and builder script |
| `docs/` | Manual QA — execution CSV and copy-paste runbook ([docs/README.md](docs/README.md)) |
| `eval/` | Local pipeline outputs (gitignored) |

## Manual QA tracking

Use alongside batch eval for cases not in the automated xlsx (setup, multi-turn, golden probes, story AC reference rows).

| File | Purpose |
|------|---------|
| [docs/CCDI-Federation-AI-Copilot-Test-Execution.csv](docs/CCDI-Federation-AI-Copilot-Test-Execution.csv) | Record Pass / Partial / Fail and `tester_notes` |
| [docs/CCDI-Federation-AI-Copilot-Manual-Tests.md](docs/CCDI-Federation-AI-Copilot-Manual-Tests.md) | Copy-paste prompts for Codex desktop |
| [docs/README.md](docs/README.md) | How manual QA relates to `npm run eval:federation` |

**Workflow:** run batch → open `eval/{timestamp}/dashboard.html` → run manual-only rows from Manual-Tests → update CSV.

## Documentation

- [skills/skill-test/SKILL.md](skills/skill-test/SKILL.md) — full pipeline workflow and Codex app rules
- [skills/skill-test/example/README.md](skills/skill-test/example/README.md) — federation batch run details
- [skills/skill-test/SYSTEM_DESIGN.md](skills/skill-test/SYSTEM_DESIGN.md) — architecture

## Install as an agent skill

```bash
npx skills add vleung-nih/federation-ai-skill-test@skill-test -a codex -g -y
```

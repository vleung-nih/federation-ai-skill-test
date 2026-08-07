#!/usr/bin/env python3
"""One-time builder: port ccdi-federation-ai-copilot evals.json → skill-test Excel."""

from __future__ import annotations

import json
from pathlib import Path

try:
    from openpyxl import Workbook
except ImportError:
    raise SystemExit("Install openpyxl: pip install openpyxl")

EVALS_JSON = Path(
    "/Users/leungvw/ai/federation/ccdi-federation-ai/skills/ccdi-federation-ai-copilot/evals/evals.json"
)
BASELINES_DIR = EVALS_JSON.parent / "baselines"
OUTPUT = Path(__file__).resolve().parent / "ccdi-federation-copilot-mvp.xlsx"

# Evals with these tags stay in evals.json for manual QA but are excluded from batch Excel.
# multi-turn: MT-01 (three prompts in one thread)
# platform-filter-risk: red-team phrasing often blocked by Codex cybersecurity filter (S-06, S-07)
# manual-golden: long live-API exploration; manual desktop only (G-07 live footprint)
BATCH_EXCLUDE_TAGS = frozenset({"multi-turn", "platform-filter-risk", "manual-golden"})


def include_in_batch(item: dict) -> bool:
    tags = set(item.get("tags") or [])
    return not tags.intersection(BATCH_EXCLUDE_TAGS)


def load_baseline(rel_path: str) -> dict:
    return json.loads((BASELINES_DIR / Path(rel_path).name).read_text(encoding="utf-8"))


def format_prompt(prompt: str) -> str:
    prompt = prompt.strip()
    if prompt.startswith("/ccdi-federation-ai-copilot"):
        return prompt
    return f"/ccdi-federation-ai-copilot\n\n{prompt}"


def enrich_expected_output(eval_item: dict) -> str:
    parts = [eval_item["expected_output"].strip()]

    baseline_rel = eval_item.get("baseline")
    if baseline_rel:
        bl = load_baseline(baseline_rel)
        tol = bl.get("tolerance_pct", 5)

        if counts := bl.get("expected_counts"):
            summary = ", ".join(f"{node} ~{count}" for node, count in counts.items())
            parts.append(f"Baseline per-node counts (±{tol}%): {summary}.")
            if errors := bl.get("error_nodes_must_report"):
                parts.append(
                    f"Must explicitly report errors for {', '.join(errors)} — not as zero counts."
                )

        if total := bl.get("expected_total_participants"):
            parts.append(f"Total participants ~{total} (±{tol}%).")
            if tops := bl.get("expected_top_diagnoses"):
                top_str = ", ".join(f"{d['diagnosis']} ~{d['total']}" for d in tops)
                parts.append(f"Top diagnoses: {top_str}.")

        if known := bl.get("expected_known_age_count"):
            parts.append(f"Known age records ~{known} (±{tol}%).")

        if rows := bl.get("expected_rows"):
            row_str = "; ".join(
                f"{r['source']} {r['cohort']} ~{r['files']} files (~{r['terabytes_decimal']} TB)"
                for r in rows
            )
            parts.append(f"Order-of-magnitude footprint baselines: {row_str}.")

    return " ".join(parts)


def main() -> None:
    data = json.loads(EVALS_JSON.read_text(encoding="utf-8"))
    evals = data["evals"]

    wb = Workbook()
    ws = wb.active
    ws.title = "test_cases"

    headers = [
        "id",
        "prompt",
        "expected_output",
        "maps_to_csv",
        "tags",
        "requires_live_api",
    ]
    ws.append(headers)

    included = [item for item in evals if include_in_batch(item)]
    skipped = [item["id"] for item in evals if not include_in_batch(item)]

    for item in included:
        ws.append(
            [
                item["id"],
                format_prompt(item["prompt"]),
                enrich_expected_output(item),
                ", ".join(item.get("maps_to_csv") or []),
                ", ".join(item.get("tags") or []),
                str(item.get("requires_live_api", False)).lower(),
            ]
        )

    # Readable column widths
    ws.column_dimensions["A"].width = 32
    ws.column_dimensions["B"].width = 80
    ws.column_dimensions["C"].width = 100
    ws.column_dimensions["D"].width = 24
    ws.column_dimensions["E"].width = 28
    ws.column_dimensions["F"].width = 18

    wb.save(OUTPUT)
    print(f"Wrote {len(included)} batch rows to {OUTPUT}")
    if skipped:
        print(f"Excluded from batch (manual-only): {', '.join(skipped)}")


if __name__ == "__main__":
    main()

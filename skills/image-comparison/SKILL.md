---
name: image-comparison
description: 'Compare two screenshot folders with pixelmatch and generate a JSON diff report. Use when asked for visual regression, image comparison, or identifying changed pages after snapshot capture.'
argument-hint: 'Folder A, Folder B, and optional report file (example: images-baseline images-candidate report.json)'
user-invocable: true
---

# Image Comparison

Compare two folders of PNG screenshots and generate a structured JSON report.

## When To Use
- Visual regression checks after UI changes
- Route-by-route smoke comparison for baseline vs candidate
- Quick summary of changed and missing pages

## Inputs
- Ask user for: folder A (baseline)
- Ask user for: folder B (candidate)
- Ask user for: report output filename

## Input Collection Rule
1. Always ask the user to provide each input value.
2. If user does not provide a value, use defaults:
  - folder A: `images`
  - folder B: `images2`
  - report output filename: `report.json`

## Portable Preflight
1. Confirm Node.js and npm:
  - `node -v`
  - `npm -v`
2. Install dependencies in a fresh checkout:
  - `npm install`
3. Confirm comparison script exists:
  - `./scripts/compare-images.mjs`

## Procedure
1. Validate prerequisites and inputs:
  - Ensure runtime checks passed (`node -v`, `npm -v`).
  - Ensure dependencies are installed (`npm install`).
  - Validate input folders exist and contain PNGs.
2. Run comparison:
  - `node ./scripts/compare-images.mjs <folderA> <folderB> <report.json>`
  - If user input is missing, run:
    - `node ./scripts/compare-images.mjs images images2 report.json`
3. Review summary fields:
   - `compared`, `identical`, `different`
   - `missingInA`, `missingInB`
4. Inspect `results[]` for per-file details and size mismatches.

## Decision Points
- If `sameSize` is false:
  - Treat as layout or viewport-driven change first.
  - Re-check capture settings and page state consistency.
- If many pages are missing in one folder:
  - Re-run snapshot capture using the exact same sitemap.
- If differences are unexpectedly high:
  - Consider dynamic content (timestamps, rotating modules, ads, auth state).

## Completion Checks
- Report file is generated and valid JSON.
- Missing lists are understood and acceptable.
- Non-identical files are triaged into expected vs unexpected changes.

## Output
- Machine-readable visual regression report suitable for smoke-test review.

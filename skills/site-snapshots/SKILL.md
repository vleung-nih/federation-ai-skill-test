---
name: site-snapshots
description: 'Capture full-page browser snapshots for a URL list (sitemap JSON) using Playwright. Use when asked to generate images from given URLs.'
argument-hint: 'Sitemap JSON and output folder (example: sitemap-20260521-180929.json screenshots)'
user-invocable: true
---

# Site Snapshots

Capture full-page PNG screenshots for each URL in a sitemap JSON file.

## When To Use
- Generate PNG screenshots from a given URL list
- Collect visual evidence for route-level smoke tests

## Inputs
- Ask user for: sitemap JSON file (array of URLs)
- Ask user for: output image folder

## Input Collection Rule
1. Always ask the user to provide each input value.
2. If user does not provide a value, use defaults:
  - sitemap file: `sitemap.json`
  - output folder: `screenshots`

## Portable Preflight
1. Confirm Node.js and npm:
  - `node -v`
2. Install project dependencies:
  - `npm install`
3. Install Playwright Chromium runtime (portable machines/CI):
  - `npx playwright install chromium`
4. Confirm script exists:
  - `./scripts/capture-images.mjs`

## Procedure
1. Validate prerequisites:
  - Ensure runtime checks passed (`node -v`, `npm -v`).
  - Ensure dependencies are installed (`npm install`).
  - Ensure Playwright browser is installed (`npx playwright install chromium`).
   - Ensure the input sitemap JSON exists and is readable.
  - Ensure script exists: `./scripts/capture-images.mjs`.
2. Capture snapshots from the given URL list:
  - `node ./scripts/capture-images.mjs <sitemap.json> <output-folder>`
  - If user input is missing, run:
    - `node ./scripts/capture-images.mjs sitemap.json screenshots`
3. Verify output count in the output folder.

## Decision Points
- If some pages fail to capture:
  - Re-run capture for same sitemap (transient network/render issues).
  - Check whether those routes require authentication.
- If page render looks incomplete:
  - Re-run at low system load; dynamic pages can vary due to lazy loading.

## Completion Checks
- Script completes and prints save paths.
- Output folder contains PNG files.
- Output PNG count is reasonable compared to the sitemap URL count.

## Output
- One image set in the selected output folder (for example `screenshots/`).
- PNG filenames are derived from the route path, not the full URL host.

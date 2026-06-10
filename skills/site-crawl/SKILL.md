---
name: site-crawl
description: 'Crawl or scan a website to discover internal URLs and generate sitemap and crawl report artifacts. Use when asked to scan site structure, enumerate routes, or build URL inventory for smoke testing.'
argument-hint: 'Start URL and optional max-pages/concurrency/output-dir (example: https://example.com --max-pages 500 --concurrency 2 --output-dir /path/to/workspace)'
user-invocable: true
---

# Site Crawl

Discover reachable internal pages from a start URL and output timestamped sitemap/report files.

## When To Use
- Build URL inventory before screenshot capture
- Scan SPA/hash-router routes
- Validate crawl coverage and route discovery

## Inputs
- Ask user for: start URL
- Ask user for: `--max-pages N`
- Ask user for: `--concurrency N`

## Input Collection Rule
1. Always ask the user to provide each input value.
2. If user does not provide a value, use defaults:
  - start URL: `https://example.com`
  - `--max-pages`: `1000`
  - `--concurrency`: `2`

## Portable Preflight
1. Confirm Node.js is available:
  - `node -v`
2. Confirm npm is available:
  - `npm -v`
3. Install dependencies if this is a fresh checkout:
  - `npm install`
4. Confirm the crawl entry script exists:
  - `./scripts/crawl-urls.mjs`

## Procedure
1. Validate environment:
  - If `node -v` or `npm -v` fails, stop and install Node.js 18+.
  - If `node_modules` is missing or stale, run `npm install`.
  - Confirm the crawl script exists: `./scripts/crawl-urls.mjs`.
2. Run crawler:
  - `node ./scripts/crawl-urls.mjs <start-url> --max-pages <N> --concurrency <N>`
  - If user input is missing, run:
    - `node ./scripts/crawl-urls.mjs https://example.com --max-pages 1000 --concurrency 2`
3. Collect generated files:
  - `<workspace-root>/sitemap-YYYYMMDD-HHMMSS.json`
  - `<workspace-root>/sitemap-YYYYMMDD-HHMMSS.txt`
  - `<workspace-root>/crawl-report-YYYYMMDD-HHMMSS.json`
4. Pick the newest sitemap JSON as canonical input for downstream snapshot runs.

## Output Location
- By default, the crawler writes artifacts to the workspace root.
- Optional override: pass `--output-dir <absolute-or-relative-path>`.

## Decision Points
- If the environment is fresh and Playwright runtime fails:
  - Run `npx playwright install chromium` once, then retry.
- If the site is timing out:
  - Lower concurrency (for example from `3` to `1` or `2`).
  - Keep `--max-pages` moderate and rerun.
- If discovered pages are too few:
  - Increase `--max-pages`.
  - Check whether the app requires login or guarded routes.
- If output contains many irrelevant URLs:
  - Start crawl from a more specific route.

## Completion Checks
- Crawl exits without fatal error.
- Crawl report contains HTTP status/title entries.
- Sitemap JSON parses as a non-empty URL array.
- Expected key routes are present in sitemap.

## Output
- A timestamped, reusable URL inventory for snapshot testing and visual comparison.

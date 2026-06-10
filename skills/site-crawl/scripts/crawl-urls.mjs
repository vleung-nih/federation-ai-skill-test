/**
 * deep-crawl.mjs  — Hash-Router aware deep crawler for React/SPA apps
 *
 * Usage:
 *   node deep-crawl.mjs https://bento-tools.org
 *   node deep-crawl.mjs https://example.com --max-pages 500 --concurrency 3
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const startUrl = args.find((a) => a.startsWith('http'));
if (!startUrl) {
  console.error('Usage: node deep-crawl.mjs https://example.com [--max-pages N] [--concurrency N]');
  process.exit(1);
}

const maxPages    = parseInt(args[args.indexOf('--max-pages')  + 1] || '1000', 10);
const concurrency = parseInt(args[args.indexOf('--concurrency')+ 1] || '2',    10);
const outputDirIndex = args.indexOf('--output-dir');
const outputDirArg = outputDirIndex >= 0 ? args[outputDirIndex + 1] : undefined;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputDir = path.resolve(scriptDir, '../../../..');
const outputDir = path.resolve(outputDirArg || defaultOutputDir);

const HASH_NAV_TIMEOUT_MS = 20000;
const HASH_ACTION_TIMEOUT_MS = 1500;
const BUNDLE_VERIFY_TIMEOUT_MS = 12000;

const origin   = new URL(startUrl).origin;

// ─── Detect if site uses hash routing  ───────────────────────────────────────
// e.g.  https://bento-tools.org/#/home  →  hash IS the route
function isHashRouted(url) {
  try {
    const u = new URL(url);
    // hash that looks like a path  /#/something
    return u.hash.startsWith('#/');
  } catch { return false; }
}

function looksLikeHashRouteHref(href) {
  if (!href) return false;
  return href.startsWith('#/') || href.startsWith('/#/') || href.includes('/#/');
}

async function detectHashRoutingOnPage(page) {
  try {
    const detected = await page.evaluate(() => {
      if (window.location.hash?.startsWith('#/')) return true;
      if (document.querySelector('a[href^="#/"], a[href^"/#/"]')) return true;
      const html = document.documentElement?.innerHTML || '';
      return /HashRouter|createHashRouter/.test(html);
    });
    return Boolean(detected);
  } catch {
    return false;
  }
}

// ─── Normalize ────────────────────────────────────────────────────────────────
// For hash-routed sites we KEEP the hash because it IS the page identity.
// For normal sites we strip it (fragments within a page).
let siteIsHashRouted = isHashRouted(startUrl); // refined after first page visit

function normalize(raw, base = startUrl) {
  try {
    const u = new URL(raw, base);
    if (!siteIsHashRouted || !u.hash.startsWith('#/')) {
      u.hash = '';                        // normal site: strip fragment
    }
    // strip trailing slash (except root)
    if (u.pathname !== '/' && u.pathname.endsWith('/'))
      u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch { return null; }
}

// ─── State ────────────────────────────────────────────────────────────────────
const visited = new Set();
const queued  = new Set();
const queue   = [];
const results = [];
let   crawled = 0;
const verifiedBundleUrlCache = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isSameOrigin(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function isIgnored(url) {
  return /^(mailto:|tel:|javascript:|data:|blob:)/i.test(url);
}
function isAsset(url) {
  return /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|zip|gz|tar|css)(\?.*)?$/i.test(url);
}

function looksLikeTrackingOrApiPath(pathname) {
  return /\/(graphql|api|rpc|collect|conversion|measurement|pagead|gtag|ccm|b\/ss|session|analytics)\b/i.test(pathname);
}

function hasErrorLikeTitleOrBody(title, text) {
  const sample = `${title}\n${text}`.toLowerCase();
  return /(404|not found|page not found|error\s*404|forbidden|access denied)/i.test(sample);
}

function enqueue(url) {
  if (!url || isIgnored(url) || isAsset(url)) return;
  const norm = normalize(url);
  if (!norm || !isSameOrigin(norm)) return;
  if (visited.has(norm) || queued.has(norm)) return;
  queued.add(norm);
  queue.push(norm);
}

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function makeTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function slugifyPage(url) {
  try {
    const u = new URL(url);
    const pathPart = u.pathname === '/' ? 'root' : u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const hashPart = u.hash.startsWith('#/') ? u.hash.slice(2) : u.hash.replace(/^#/, '');
    const combined = [pathPart, hashPart].filter(Boolean).join('.');
    return combined
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'root';
  } catch {
    return 'unknown';
  }
}

async function saveDomSnapshot(page, url) {
  try {
    const currentUrl = page.url() || url;
    const domain = new URL(currentUrl).hostname.replace(/[^a-zA-Z0-9.-]+/g, '_');
    const pageSlug = slugifyPage(currentUrl);
    const timestamp = makeTimestamp();
    const html = await page.content();
    const fileName = `${domain}.${pageSlug}.${timestamp}.html`;
    const filePath = `tmp/${fileName}`;
    await fs.writeFile(filePath, html, 'utf8');
    log(`📝 DOM saved: ${filePath}`);
  } catch (err) {
    log(`⚠️ DOM snapshot skipped for ${url}: ${err.message}`);
  }
}

async function waitForRenderedContent(page, preferFastHashWait) {
  const timeout = preferFastHashWait ? 10000 : 5000;

  // Wait for meaningful hydrated content from client-side rendering.
  await page.waitForFunction(() => {
    const root =
      document.querySelector('#root') ||
      document.querySelector('#app') ||
      document.querySelector('main') ||
      document.body;

    if (!root) return false;
    const textLen = (root.innerText || '').trim().length;
    const linkCount = root.querySelectorAll?.('a[href]').length || 0;
    const nodeCount = root.querySelectorAll?.('*').length || 0;

    return textLen > 120 || linkCount > 5 || nodeCount > 60;
  }, { timeout }).catch(() => {});

  // Small settle to reduce capturing transient loading states.
  await page.waitForTimeout(preferFastHashWait ? 400 : 250);
}

async function extractFromBundles(page) {
  const found = new Set();

  try {
    const scripts = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')].map((s) => s.src)
    );

    for (const src of scripts) {
      try {
        const res = await page.request.fetch(src);
        if (!res.ok()) continue;
        const js = await res.text();

        // Hash-like route strings, e.g. "#/home" or "/#/home"
        for (const [, p] of js.matchAll(/["'`](#\/[a-zA-Z0-9\-_/]+|\/#\/[a-zA-Z0-9\-_/]+)["'`]/g)) {
          const hashPath = p.startsWith('#') ? p : p.replace(/^\//, '');
          const full = normalize(`${origin}/${hashPath}`);
          if (full) found.add(full);
        }

        // Router object style strings, e.g. path: "/about", to: "/explore"
        for (const [, p] of js.matchAll(/(?:path|to|route)\s*:\s*["'`](\/[a-zA-Z0-9\-_/.:*]+)["'`]/g)) {
          if (!p || p.includes('..') || p.includes(':*')) continue;
          if (/\.(js|css|ts|jsx|tsx|map|json|svg|png|jpe?g|gif|woff2?|ttf)$/.test(p)) continue;
          const full = normalize(p, startUrl);
          if (full) found.add(full);
        }
      } catch {
        // Ignore unreadable bundles.
      }
    }
  } catch {
    // Ignore pages where script discovery fails.
  }

  return found;
}

async function verifyBundleDiscoveredUrl(browser, url) {
  if (verifiedBundleUrlCache.has(url)) return verifiedBundleUrlCache.get(url);

  let accepted = false;
  const testPage = await browser.newPage();
  testPage.setDefaultTimeout(BUNDLE_VERIFY_TIMEOUT_MS);
  testPage.setDefaultNavigationTimeout(BUNDLE_VERIFY_TIMEOUT_MS);

  try {
    const u = new URL(url);
    if (isAsset(url) || looksLikeTrackingOrApiPath(u.pathname)) {
      verifiedBundleUrlCache.set(url, false);
      await testPage.close();
      return false;
    }

    const response = await testPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: BUNDLE_VERIFY_TIMEOUT_MS,
    });

    const status = response?.status?.() ?? 0;
    if (status >= 400) {
      verifiedBundleUrlCache.set(url, false);
      await testPage.close();
      return false;
    }

    const contentType = (response?.headers?.()['content-type'] || '').toLowerCase();
    if (contentType && !contentType.includes('text/html')) {
      verifiedBundleUrlCache.set(url, false);
      await testPage.close();
      return false;
    }

    const title = (await testPage.title().catch(() => '')) || '';
    const bodyText = await testPage.locator('body').innerText().catch(() => '');
    if (hasErrorLikeTitleOrBody(title, bodyText)) {
      verifiedBundleUrlCache.set(url, false);
      await testPage.close();
      return false;
    }

    accepted = true;
  } catch {
    accepted = false;
  } finally {
    await testPage.close();
  }

  verifiedBundleUrlCache.set(url, accepted);
  return accepted;
}

async function verifyBundleDiscoveredUrls(browser, urls) {
  const verified = new Set();
  for (const url of urls) {
    const ok = await verifyBundleDiscoveredUrl(browser, url);
    if (ok) verified.add(url);
  }
  return verified;
}

// ─── Navigate to a URL respecting hash routing ───────────────────────────────
// For hash-routed pages the real HTML doc is always origin/ — the hash tells
// the React app which component to render. We MUST navigate to the full hash URL
// so React Router mounts the correct route tree and renders its links.
async function gotoUrl(page, url, preferFastHashWait) {
  // Hash-routed SPAs often keep background requests open; avoid waiting for network idle.
  if (preferFastHashWait) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: HASH_NAV_TIMEOUT_MS });
    await page.waitForTimeout(300);
    return response;
  }
  return page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
}

// ─── Extract from sitemap / robots ───────────────────────────────────────────
async function extractFromSitemap(page) {
  const found = new Set();
  for (const url of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/robots.txt`]) {
    try {
      const res  = await page.request.fetch(url);
      const text = await res.text();
      const locs = url.endsWith('.xml')
        ? [...text.matchAll(/<loc>(.*?)<\/loc>/gi)].map(([,l]) => l.trim())
        : [...text.matchAll(/^(?:Allow|Disallow|Sitemap):\s*(.+)/gim)].map(([,l]) => l.trim());
      for (const loc of locs) {
        const full = normalize(loc, startUrl);
        if (full && isSameOrigin(full)) found.add(full);
      }
    } catch { /* no sitemap */ }
  }
  return found;
}

// ─── Trigger hidden nav links ─────────────────────────────────────────────────
async function triggerHiddenLinks(page, preferFastHashWait) {
  // Click hamburger/menu toggles
  for (const sel of [
    '[aria-label*="menu" i]', '[class*="hamburger"]', '[class*="menu-toggle"]',
    '[class*="burger"]', 'button[class*="menu"]', '[class*="nav-toggle"]',
  ]) {
    for (const el of await page.$$(sel)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // Hover top-level nav items to reveal dropdowns
  for (const el of await page.$$('nav a, header a, [role="navigation"] a, [class*="navbar"] a')) {
    await el.hover().catch(() => {});
    await page.waitForTimeout(150);
  }

  // Scroll to bottom (lazy rendering)
  await page.evaluate(async () => {
    await new Promise((res) => {
      let last = -1;
      const t = setInterval(() => {
        window.scrollBy(0, 400);
        if (document.body.scrollHeight === last) { clearInterval(t); res(); }
        last = document.body.scrollHeight;
      }, 150);
      setTimeout(() => { clearInterval(t); res(); }, 5000);
    });
    window.scrollTo(0, 0);
  });

  if (preferFastHashWait) {
    await page.waitForTimeout(300);
  } else {
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  }
}

// ─── Scrape all hrefs from DOM ────────────────────────────────────────────────
async function scrapeLinks(page) {
  const currentUrl = page.url();
  const hrefs = await page.$$eval('a[href]', (els) =>
    els.map((a) => a.getAttribute('href'))  // use getAttribute to get the raw href
       .filter(Boolean)
  ).catch(() => []);

  const found = new Set();
  for (const href of hrefs) {
    if (isIgnored(href)) continue;
    if (looksLikeHashRouteHref(href) && !siteIsHashRouted) {
      siteIsHashRouted = true;
      log('🔁 Hash-based routing detected from anchor links');
    }

    // Handle hash hrefs like  #/tools/json-formatter
    if (href.startsWith('#/')) {
      const full = normalize(`${origin}/${href}`);
      if (full) found.add(full);
    } else {
      // Resolve relative / absolute URLs
      try {
        const full = normalize(new URL(href, currentUrl).toString(), currentUrl);
        if (full) found.add(full);
      } catch { /* bad url */ }
    }
  }
  return found;
}

// ─── Crawl one page ───────────────────────────────────────────────────────────
async function crawlPage(browser, url) {
  const page = await browser.newPage();
  const preferFastHashWait = siteIsHashRouted || isHashRouted(url);
  page.setDefaultTimeout(preferFastHashWait ? HASH_ACTION_TIMEOUT_MS : 60000);
  page.setDefaultNavigationTimeout(preferFastHashWait ? HASH_NAV_TIMEOUT_MS : 60000);

  try {
    const response = await gotoUrl(page, url, preferFastHashWait);
    const status   = response?.status?.() ?? 0;
    if (status >= 400) { log(`✗ ${status} ${url}`); return []; }

    // On first page, detect hash routing
    if (crawled <= 1) {
      const currentUrl = page.url();
      siteIsHashRouted =
        isHashRouted(url) ||
        isHashRouted(currentUrl) ||
        await detectHashRoutingOnPage(page);
      if (siteIsHashRouted) log('🔁 Hash-based routing detected (React HashRouter)');
    }

    await page.waitForSelector('a', { timeout: 5000 }).catch(() => {});
    await waitForRenderedContent(page, preferFastHashWait);
    const title = await page.title().catch(() => '');
    log(`✓ [${status}] ${url}  "${title}"`);
    results.push({ url, status, title });

    const [domLinks, sitemapLinks, bundleLinks] = await Promise.all([
      (async () => { await triggerHiddenLinks(page, preferFastHashWait); return scrapeLinks(page); })(),
      crawled === 1 ? extractFromSitemap(page) : Promise.resolve(new Set()),
      extractFromBundles(page),
    ]);

    const verifiedBundleLinks = await verifyBundleDiscoveredUrls(browser, bundleLinks);

    // await saveDomSnapshot(page, url);

    const all = new Set([...domLinks, ...sitemapLinks, ...verifiedBundleLinks]);
    log(`  └─ discovered ${all.size} links`);
    return [...all];

  } catch (err) {
    log(`✗ ERROR ${url}: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`🕷  Deep crawl: ${origin}`);
  log(`   Max pages: ${maxPages}  |  Concurrency: ${concurrency}`);
  log(`   Output dir: ${outputDir}`);

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  enqueue(startUrl);

  while (queue.length > 0 && crawled < maxPages) {
    const batch = queue.splice(0, concurrency);
    crawled += batch.length;
    for (const url of batch) visited.add(url);

    const batchLinks = await Promise.all(batch.map((url) => crawlPage(browser, url)));

    let newCount = 0;
    for (const links of batchLinks) {
      for (const link of links) {
        const before = queued.size;
        enqueue(link);
        if (queued.size > before) newCount++;
      }
    }
    log(`📊 Queue: ${queue.length}  |  Crawled: ${crawled}  |  New: ${newCount}`);
  }

  await browser.close();

  // ─── Save results ────────────────────────────────────────────────────────
  const sortedUrls = results.map((r) => r.url).sort();
  const timestamp = makeTimestamp();
  const sitemapJsonFile = path.join(outputDir, `sitemap-${timestamp}.json`);
  const sitemapTxtFile = path.join(outputDir, `sitemap-${timestamp}.txt`);
  const crawlReportFile = path.join(outputDir, `crawl-report-${timestamp}.json`);

  await fs.writeFile(sitemapJsonFile, JSON.stringify(sortedUrls, null, 2), 'utf8');
  await fs.writeFile(sitemapTxtFile, sortedUrls.join('\n') + '\n', 'utf8');
  await fs.writeFile(crawlReportFile, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n──────────────────────────────────────────────────');
  console.log(`✅  Crawled ${results.length} pages`);
  console.log(`📄  ${sitemapJsonFile}  — sorted URL array`);
  console.log(`📄  ${sitemapTxtFile}   — one URL per line`);
  console.log(`📄  ${crawlReportFile}  — URL + status + title`);
  console.log('──────────────────────────────────────────────────');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });

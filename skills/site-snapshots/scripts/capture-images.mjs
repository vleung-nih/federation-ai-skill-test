import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const sitemapFile = process.argv[2] || 'sitemap.json';
const outDir = process.argv[3] || 'screenshots';

const raw = await fs.readFile(sitemapFile, 'utf8');
const urls = JSON.parse(raw);

await fs.mkdir(outDir, { recursive: true });

function safeName(input) {
  const url = new URL(input);
  const pathname = url.pathname === '/' ? 'root' : url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const hashPath = url.hash.startsWith('#/') ? url.hash.slice(2) : '';
  const name = [pathname, hashPath].filter(Boolean).join('_');

  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

async function clickContinuePopup(page) {
  const clicked = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const popupSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      'dialog',
      '.modal',
      '.popup',
      '.overlay',
      '.cookie-banner'
    ];

    const containers = [...document.querySelectorAll(popupSelectors.join(','))]
      .filter(isVisible);

    const buttonMatches = (btn) => {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return text === 'continue' || text.includes('continue');
    };

    // 1) Prefer buttons inside visible popup containers
    for (const container of containers) {
      const buttons = [...container.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
        .filter(isVisible);

      const continueBtn = buttons.find(buttonMatches);
      if (continueBtn) {
        continueBtn.click();
        return true;
      }
    }

    // 2) Fallback: any visible Continue button on the page
    const allButtons = [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
      .filter(isVisible);

    const fallbackBtn = allButtons.find(buttonMatches);
    if (fallbackBtn) {
      fallbackBtn.click();
      return true;
    }

    return false;
  });

  if (clicked) {
    await page.waitForTimeout(1500);
  }

  return clicked;
}

const browser = await chromium.launch({
  headless: true
});

const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: {
    width: 1440,
    height: 900
  }
});

page.setDefaultTimeout(60000);

for (const pageUrl of urls) {
  const name = safeName(pageUrl);

  try {
    console.log(`Opening ${pageUrl}`);

    await page.goto(pageUrl, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Let React finish rendering
    await page.waitForTimeout(3000);

    // Try to dismiss a popup with a Continue button
    await clickContinuePopup(page);

    // Scroll to help lazy-loaded content appear
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 1000;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    const filePath = path.join(outDir, `${name}.png`);

    await page.screenshot({
      path: filePath,
      fullPage: true
    });

    console.log(`Saved ${filePath}`);
  } catch (err) {
    console.warn(`Failed ${pageUrl}: ${err.message}`);
  }
}

await browser.close();
console.log('Done');
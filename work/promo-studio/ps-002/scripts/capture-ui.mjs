import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const readArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const sourceRepo = path.resolve(readArg('--source-repo', process.env.PROMO_SOURCE_REPO || ''));
const url = readArg('--url');
const output = path.resolve(readArg('--output'));
const width = Number(readArg('--width', '1320'));
const height = Number(readArg('--height', '1356'));

if (!sourceRepo || !url || !output) {
  throw new Error('Usage: capture-ui.mjs --source-repo <path> --url <url> --output <png>');
}

const playwrightEntry = path.join(sourceRepo, 'node_modules', 'playwright', 'index.mjs');
if (!fs.existsSync(playwrightEntry)) {
  throw new Error(`Playwright is unavailable in source repository: ${playwrightEntry}`);
}

const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim() || null,
    images: document.querySelectorAll('img').length,
    icons: document.querySelectorAll('svg').length,
    bodyText: document.body.innerText,
  }));
  if (state.title !== 'Stakkd' || !state.bodyText.includes('Technics SL-1200')) {
    throw new Error(`Capture assertion failed: ${JSON.stringify(state)}`);
  }
  if (state.images !== 0 || state.icons < 5) {
    throw new Error(`Expected category icons without fixture images: ${JSON.stringify(state)}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output });
  console.log(JSON.stringify({ output, width, height, assertions: state }, null, 2));
} finally {
  await browser.close();
}

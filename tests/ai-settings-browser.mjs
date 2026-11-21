import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://localhost:3015';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base + '/tests/fixtures/ai-settings.html');
  for (const label of ['Gemini API Key', 'OpenAI API Key']) {
    assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), '');
    assert.match(await page.getByLabel(label, { exact: true }).getAttribute('placeholder'), /Configured securely/);
  }
  await page.getByLabel('Anthropic API Key', { exact: true }).fill('fixture-replacement');
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await page.getByLabel('Anthropic API Key', { exact: true }).inputValue(), 'fixture-replacement');
  await page.getByRole('button', { name: 'Allow save', exact: true }).click();
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Configuration saved' }).waitFor();
  assert.equal(await page.getByLabel('Anthropic API Key', { exact: true }).inputValue(), '');
  await page.getByRole('button', { name: 'Show new Anthropic API Key', exact: true }).click();
  assert.equal(await page.getByLabel('Anthropic API Key', { exact: true }).inputValue(), '');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_DIR + '/ai-settings-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: status-only fields, failed-save retry, saved key cleared, reveal cannot retrieve saved key, mobile layout, no console exceptions.');
} finally { await browser.close(); }

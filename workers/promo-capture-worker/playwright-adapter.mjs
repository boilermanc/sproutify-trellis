import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const ALLOWED_ASSERTION = 'visible_text_or_selector';
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET = /\b(?:sk|pk|eyJ)[_-]?[A-Za-z0-9_-]{20,}\b/;
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const privateHost = host => host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0'
  || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);

const run = (command, args, collect = false) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', collect ? 'pipe' : 'ignore', 'pipe'], windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1000)}`)));
});

const boundedSteps = fixture => {
  if (!record(fixture) || (fixture.record_ms !== undefined
    && (!Number.isInteger(fixture.record_ms) || fixture.record_ms < 1000 || fixture.record_ms > 15000))) {
    throw new Error('Capture fixture must be a bounded object with record_ms between 1000 and 15000.');
  }
  const steps = Array.isArray(fixture?.steps) ? fixture.steps : [];
  if (steps.length > 20 || steps.some(step => !record(step) || !['click', 'wait_for'].includes(step.action)
    || typeof step.selector !== 'string' || !step.selector.trim() || step.selector.length > 500)) {
    throw new Error('Capture fixture contains an unsupported or unbounded step.');
  }
  return steps;
};

async function applyFixture(page, fixture) {
  for (const step of boundedSteps(fixture)) {
    const locator = page.locator(step.selector).first();
    if (step.action === 'click') await locator.click({ timeout: 15000 });
    if (step.action === 'wait_for') await locator.waitFor({ state: 'visible', timeout: 15000 });
  }
}

async function evaluateAssertions(page, assertions) {
  const results = [];
  for (const assertion of assertions) {
    if (assertion.kind !== ALLOWED_ASSERTION || typeof assertion.value !== 'string' || !assertion.value.trim()) {
      throw new Error(`Unsupported capture assertion: ${assertion.kind}`);
    }
    const value = assertion.value.trim();
    const selectorMatch = await page.locator(value).count().catch(() => 0);
    const passed = selectorMatch > 0
      ? await page.locator(value).first().isVisible().catch(() => false)
      : await page.getByText(value, { exact: false }).first().isVisible().catch(() => false);
    results.push({ kind: assertion.kind, value: assertion.value, passed });
  }
  return results;
}

export function visibleTextContainsPii(text) {
  const value = String(text || '');
  return EMAIL.test(value) || PHONE.test(value) || SECRET.test(value);
}

export async function captureWithPlaywright({ plan, fixture, auth, heartbeat, environment = process.env }) {
  const executablePath = environment.PROMO_CAPTURE_BROWSER_EXECUTABLE;
  if (!executablePath) throw new Error('PROMO_CAPTURE_BROWSER_EXECUTABLE is required.');
  const { chromium } = await import('playwright-core');
  const work = await mkdtemp(join(tmpdir(), 'trellis-promo-capture-'));
  const videoDirectory = join(work, 'video');
  const mp4Path = join(work, 'capture.mp4');
  let browser;
  let context;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const storageState = record(auth?.storage_state) ? auth.storage_state : undefined;
    context = await browser.newContext({
      viewport: plan.viewport, serviceWorkers: 'block', storageState,
      recordVideo: { dir: videoDirectory, size: plan.viewport },
    });
    const page = await context.newPage();
    const allowedOrigin = new URL(plan.capture_url).origin;
    await context.route('**/*', async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (!['http:', 'https:'].includes(requestUrl.protocol) || privateHost(requestUrl.hostname.toLowerCase())) {
        return route.abort('blockedbyclient');
      }
      if (request.isNavigationRequest() && requestUrl.origin !== allowedOrigin) return route.abort('blockedbyclient');
      return route.continue();
    });
    await page.goto(plan.capture_url, { waitUntil: 'networkidle', timeout: 45000 });
    await heartbeat(30);
    await applyFixture(page, fixture);
    for (const selector of plan.selectors) await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
    for (const selector of plan.masks) await page.locator(selector).evaluateAll(elements => {
      for (const element of elements) element.style.setProperty('visibility', 'hidden', 'important');
    });
    const assertions = await evaluateAssertions(page, plan.assertions);
    if (assertions.some(item => !item.passed)) throw new Error('One or more approved capture assertions failed.');
    const visibleText = await page.locator('body').innerText();
    if (visibleTextContainsPii(visibleText)) throw new Error('Capture stopped because visible content resembles PII or a secret.');
    await page.waitForTimeout(Math.max(1000, Math.min(15000, Number(fixture?.record_ms || 3000))));
    const still = await page.screenshot({ type: 'png', fullPage: false });
    const video = page.video();
    await context.close();
    context = null;
    const webmPath = await video.path();
    await run(environment.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-i', webmPath, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path,
    ]);
    const videoBytes = await readFile(mp4Path);
    const probe = await run(environment.FFPROBE_PATH || 'ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', mp4Path,
    ], true);
    const durationSeconds = Number(JSON.parse(probe).format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600) {
      throw new Error('Captured video duration is invalid.');
    }
    return {
      video: { bytes: videoBytes, width: plan.viewport.width, height: plan.viewport.height, duration_seconds: durationSeconds },
      stills: [{ bytes: still, width: plan.viewport.width, height: plan.viewport.height }],
      route: plan.route, commit_sha: plan.commit_sha, masks_applied: [...plan.masks], assertions, contains_pii: false,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

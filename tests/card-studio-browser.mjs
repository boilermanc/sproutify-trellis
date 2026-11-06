// Local fixture: external traffic is mocked; no live generation or database writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3015';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  const prompts = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.pathname.endsWith('/functions/v1/ai-generate')) {
      prompts.push(JSON.parse(route.request().postData()));
      return route.fulfill({ json: { text: 'A fixture brief grounded in the selected direction.' } });
    }
    if (url.pathname.endsWith('/rest/v1/brand_identities')) {
      const slug = url.searchParams.get('branch_id')?.replace('eq.', '');
      return route.fulfill({ json: { branch_id: slug, status: 'active', mission: slug === 'fixture' ? 'Track seedling watering.' : 'Study scripture.', marketing_hooks: [] } });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => {
    if (localStorage.getItem('card-fixture-seeded')) return;
    localStorage.setItem('card-fixture-seeded', 'yes');
    localStorage.setItem('trellis_card_studio_draft_v1', JSON.stringify({ fixture: {
      savedAt: new Date().toISOString(), items: [{
        concept: { id: 'one', template: 'statement', eyebrow: 'Grow together', logoText: 'Garden', caption: 'Original caption', headline: 'Small steps', palette: { bg1: '#ffffff', text: '#123123', muted: '#555555', accent: '#008844' } },
        caption: 'Original caption', platform: 'instagram', scheduledFor: '2027-01-01T12:00:00Z',
      }],
    } }));
  });
  await page.goto(base + '/tests/fixtures/card-studio.html', { timeout: 60000 });
  const done = page.getByRole('button', { name: 'Done with this group' });
  await done.click({ timeout: 60000 });
  await page.getByRole('region', { name: 'Group summary' }).waitFor();
  assert.match(await page.getByRole('region', { name: 'Group summary' }).innerText(), /1 unfinished card/);
  assert.equal(await page.locator('h1').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('trellis_card_studio_draft_v1')).fixture.items.length), 1);
  await page.getByRole('button', { name: 'Resume group' }).click();
  await done.waitFor();
  await done.click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Start a new group' }).click();
  await page.getByRole('region', { name: 'Group summary' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: process.env.TEMP + '/card-studio-summary.png', fullPage: true });
  await page.getByRole('button', { name: 'Resume group' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await done.click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Start a new group' }).click();
  await page.getByRole('button', { name: 'Generate 3 Concepts' }).waitFor();
  assert.equal(await done.count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('trellis_card_studio_draft_v1')).fixture), undefined);
  await page.getByText('Adjust style and number of concepts', { exact: true }).click();
  await page.getByLabel('Brand creative direction').selectOption('features');
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).click();
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).waitFor();
  assert.match(prompts.at(-1).contents, /Track seedling watering/);
  assert.match(prompts.at(-1).contents, /Feature mode: true/);
  await page.getByLabel('Preview brand').selectOption('rekkrd');
  await page.getByLabel('Brand creative direction').selectOption('vinyl-ritual');
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).click();
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).waitFor();
  assert.match(prompts.at(-1).contents, /Selected situation: A close, tactile moment of putting a record on a turntable/);
  assert.doesNotMatch(prompts.at(-1).contents, /Track seedling watering/);
  await page.getByLabel('Brand creative direction').selectOption('features');
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).click();
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).waitFor();
  assert.match(prompts.at(-1).contents, /Spins: log records/);
  await page.getByLabel('Preview brand').selectOption('rejoice');
  await page.getByLabel('Brand creative direction').selectOption('joy-worth-noticing');
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).click();
  await page.getByRole('button', { name: 'Suggest brief', exact: true }).waitFor();
  assert.match(prompts.at(-1).contents, /Selected situation: Celebration, gratitude/);
  assert.doesNotMatch(prompts.at(-1).contents, /Stakkd|Track seedling watering/);
  assert.deepEqual(errors, []);
  console.log('PASS: group lifecycle, mobile layout, focus, selected-direction prompts, feature mode and brand isolation.');
} finally { await browser.close(); }

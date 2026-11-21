// Local fixture-only browser check. All non-local network requests are blocked.
// Requires a running Vite dev server and Playwright (or PLAYWRIGHT_MODULE absolute path).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { makeBrief } from './fixtures/opportunity-brief.mjs';
import { buildSavedBrief, buildApprovedBrief } from '../supabase/functions/opportunity-briefs/policy.mjs';
import { randomUUID } from 'node:crypto';

const playwright = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.BRIEF_TEST_URL || 'http://127.0.0.1:3000';
const browser = await playwright.chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.setFixedTime(new Date('2026-09-22T15:01:00Z'));
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Fixture browser error:', error.message); });
  page.on('requestfailed', request => console.error('Fixture request failed:', new URL(request.url()).pathname, request.failure()?.errorText));
  let current = makeBrief();
  // Two real entries exercise disclosure: the editor must never expand every item.
  current.offerings.push({ ...current.offerings[0], id: 'second-offering', name: 'Fictional second offering' });
  current.facts.push({ ...structuredClone(current.facts[0]), id: 'second-fact', claim: 'A second fictional fact.', evidence: [{ ...current.facts[0].evidence[0], id: 'second-evidence', excerpt: 'A second fictional fact.' }] });
  const scope = { brand_id: current.brand_id, branch_id: current.branch_id, project_id: current.project_id };
  let versions = [{ brief: current }];
  let writes = 0;
  let lastSavedInput;
  const snapshot = () => ({ scope, brands: [{ id: scope.brand_id, name: 'Fixture Nursery' }], current, versions, can_manage: true, can_approve: true });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/functions/v1/opportunity-briefs')) {
      const body = route.request().postDataJSON();
      if (body.project_id === 'empty-brief') return route.fulfill({ json: { ...snapshot(), current: null, versions: [] } });
      if (body.project_id === 'missing-profile') return route.fulfill({ json: { scope: null, brands: [], current: null, versions: [], can_manage: true, can_approve: true } });
      if (body.project_id === 'unavailable') return route.fulfill({ status: 503, json: { error: 'Shared brief storage is not installed yet.', code: 'unavailable' } });
      if (body.project_id === 'read-only') return route.fulfill({ json: { ...snapshot(), can_manage: false, can_approve: false } });
      if (body.action === 'list') return route.fulfill({ json: snapshot() });
      writes++;
      assert.equal(body.expected_version_id, current.version_id);
      const args = { previous: current, scope, actorId: 'fixture-reviewer', now: '2026-09-22T15:00:00Z', newId: randomUUID };
      if (body.action === 'save') { lastSavedInput = body.brief; current = buildSavedBrief({ ...args, input: body.brief }); }
      else current = buildApprovedBrief({ ...args, confirmedFactIds: body.confirmed_fact_ids });
      versions = [{ brief: current }, ...versions];
      return route.fulfill({ json: { brief: current } });
    }
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/__brief_fixture__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@vite/client');
      const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
      const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = clientModule.default || clientModule;
      const { default: Panel } = await import('/components/OpportunityBriefPanel.tsx');
      await import('/index.css');
      function Harness() { const [project,setProject] = React.useState('empty-brief'); return React.createElement('main',{style:{padding:'24px'}},
        React.createElement('button',{onClick:()=>setProject('empty-brief')},'Test empty brief'),
        React.createElement('button',{onClick:()=>setProject(${JSON.stringify(scope.project_id)})},'Test approved brief'),
        React.createElement('button',{onClick:()=>setProject('missing-profile')},'Test missing profile'),
        React.createElement('button',{onClick:()=>setProject('unavailable')},'Test unavailable'),
        React.createElement('button',{onClick:()=>setProject('read-only')},'Test read only'),
        React.createElement(Panel,{key:project,projectId:project,addToast:()=>{}})); }
      createRoot(document.getElementById('root')).render(React.createElement(Harness));
    </script></body></html>` });
    return route.continue();
  });
  async function compactState(label, maxHeight = 1200) {
    assert.equal(await page.locator('input:visible, textarea:visible').count(), 0, label + ' must not expose an editor');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, label + ' must not overflow horizontally');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(height <= maxHeight, label + ' must stay compact');
    console.log(`LAYOUT: ${label} scrollHeight=${height}px viewport=${page.viewportSize().width}x${page.viewportSize().height}`);
  }
  async function openDetails(name) {
    const summary = page.locator('summary').filter({ hasText: name }).first();
    if (!(await summary.evaluate(node => node.parentElement.open))) await summary.click();
  }
  await page.goto(`${base}/__brief_fixture__`);
  await page.getByRole('button', { name: 'Start setup', exact: true }).waitFor();
  await compactState('Empty desktop', 1000);
  await page.setViewportSize({ width: 390, height: 844 });
  await compactState('Empty mobile');
  if (process.env.BRIEF_SCREENSHOT) await page.screenshot({ path: process.env.BRIEF_SCREENSHOT.replace(/\.png$/, '-empty-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Start setup', exact: true }).click();
  await page.getByRole('button', { name: '1. Business', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Topics to research (one per line)', { exact: true }).count(), 0, 'Inactive mode must not expose Goals inputs');
  await page.getByRole('button', { name: 'Close setup', exact: true }).click();
  await page.getByRole('button', { name: 'Start setup', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Test approved brief', exact: true }).click();
  await page.getByRole('button', { name: 'Edit brief', exact: true }).waitFor();
  await compactState('Approved mobile');
  if (process.env.BRIEF_SCREENSHOT) await page.screenshot({ path: process.env.BRIEF_SCREENSHOT.replace(/\.png$/, '-ready-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await compactState('Approved desktop', 1000);
  assert.equal(await page.locator('pre:visible').count(), 0, 'History JSON is hidden by default');
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click();
  await page.getByRole('button', { name: '1. Business', exact: true }).waitFor();
  await openDetails('Vegetable seedlings');
  const name = page.locator('[aria-label="Offering name"]:visible');
  await name.fill('Updated fictional offering');
  await openDetails('Fictional second offering');
  assert.equal(await page.locator('[aria-label="Offering name"]:visible').count(), 1, 'Only one offering editor is expanded');
  await page.getByRole('button', { name: '2. Goals', exact: true }).click();
  assert.equal(await page.locator('[aria-label="Offering name"]:visible').count(), 0, 'Business fields disappear in Goals');
  const seeds = page.getByLabel('Topics to research (one per line)', { exact: true });
  await seeds.fill('first question\nsecond question');
  await page.getByRole('button', { name: '1. Business', exact: true }).click();
  await openDetails('Updated fictional offering');
  assert.equal(await page.locator('[aria-label="Offering name"]:visible').inputValue(), 'Updated fictional offering', 'Step switch retains edits');
  await page.getByRole('button', { name: '2. Goals', exact: true }).click();
  assert.equal(await seeds.inputValue(), 'first question\nsecond question');
  await page.getByRole('button', { name: '3. Facts & review', exact: true }).click();
  assert.equal(await seeds.count(), 0);
  assert.equal(await page.locator('[aria-label="Exact claim"]:visible').count(), 0, 'Evidence remains collapsed');
  await openDetails('Facts and evidence');
  await openDetails(current.facts[0].claim);
  const claim = page.locator('[aria-label="Exact claim"]:visible');
  await claim.fill('Updated fictional claim backed by the fixture source.');
  await openDetails('A second fictional fact.');
  assert.equal(await page.locator('[aria-label="Exact claim"]:visible').count(), 1, 'Only one fact editor is expanded');
  await openDetails('Human approval');
  assert.equal(await page.getByRole('button', { name: 'Approve saved brief', exact: true }).isDisabled(), true, 'Dirty facts cannot be approved');
  assert.equal(await page.getByLabel('I approve this saved brief and the checked facts for this brand.', { exact: true }).isDisabled(), true);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
  assert.equal(current.version, 2);
  assert.deepEqual(lastSavedInput.research_context.topic_seeds, ['first question', 'second question']);
  assert.equal(current.status, 'draft'); assert.equal(current.facts[0].status, 'proposed');
  // Saving may keep the editor open or return to the compact summary.
  const editButton = page.getByRole('button', { name: 'Edit brief', exact: true });
  if (await editButton.isVisible()) await editButton.click();
  await page.getByRole('button', { name: '3. Facts & review', exact: true }).click();
  const approvalSummary = page.locator('summary').filter({ hasText: 'Human approval' }).first();
  if (!(await approvalSummary.evaluate(node => node.parentElement.open))) await approvalSummary.click();
  await page.getByLabel('I verified the evidence and dates for:', { exact: false }).first().check();
  await page.getByLabel('I approve this saved brief and the checked facts for this brand.', { exact: true }).check();
  await page.getByRole('button', { name: 'Approve saved brief', exact: true }).click();
  await page.getByText('Version 3 · approved', { exact: false }).first().waitFor();
  assert.equal(current.status, 'approved'); assert.equal(writes, 2);
  if (process.env.BRIEF_SCREENSHOT) await page.screenshot({ path: process.env.BRIEF_SCREENSHOT, fullPage: true });

  await page.getByRole('button', { name: 'Test read only', exact: true }).click();
  await page.getByText('Read-only access.', { exact: false }).waitFor();
  await compactState('Read-only');
  await page.getByRole('button', { name: 'View brief', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save draft', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Test missing profile', exact: true }).click();
  await page.getByRole('heading', { name: 'Marketing profile required' }).waitFor();
  await compactState('Missing profile');
  assert.equal(await page.getByRole('button', { name: 'Start setup', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Test unavailable', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'not installed' }).waitFor();
  await compactState('Unavailable backend');
  assert.equal(writes, 2); assert.deepEqual(errors, []);
  console.log('PASS: compact empty/approved mobile+desktop, explicit setup, single mode/item, retained unsaved edits, save-before-approval, history disclosure, read-only/missing/unavailable; no external network allowed.');
} finally { await browser.close(); }

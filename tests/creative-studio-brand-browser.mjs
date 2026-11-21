// Run with Vite available; all external requests are intercepted (no live writes).
// PLAYWRIGHT_MODULE may point to the bundled Playwright index.mjs.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const identity = {
  id: 'brand', branch_id: 'rekkrd', name: 'Rekkrd', status: 'active',
  mission: 'Help listeners enjoy their record collections.',
  target_audience: 'Vinyl collectors', voice: 'Warm and knowledgeable',
  website_url: 'https://rekkrd.example.test',
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mode = 'loaded';
  let releaseBrand;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      if (url.pathname.endsWith('/rest/v1/brand_identities')) {
        assert.equal(url.searchParams.get('branch_id'), 'eq.rekkrd');
        assert.equal(url.searchParams.get('status'), 'eq.active');
        if (mode === 'delayed') await new Promise(resolve => { releaseBrand = resolve; });
        if (mode === 'missing') return route.fulfill({ status: 406, json: { code: 'PGRST116' } });
        if (mode === 'error') return route.fulfill({ status: 403, json: { code: '42501', message: 'Fixture access denied' } });
        return route.fulfill({ json: identity });
      }
      if (url.pathname.includes('/rest/v1/')) {
        assert.equal(route.request().method(), 'GET', 'No database writes during verification');
        return route.fulfill({ json: [] });
      }
      return route.abort();
    }
    if (url.pathname === '/__creative_brand_fixture__') return route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body><div id="root" style="padding:16px"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
      await import('/@vite/client');
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const client=await import('/node_modules/.vite/deps/react-dom_client.js'); const {createRoot}=client.default||client;
      const {default:Panel}=await import('/pages/VideoAdLab.tsx'); await import('/index.css');
      createRoot(document.getElementById('root')).render(React.createElement(Panel,{
        selectedBranchSlug:'rekkrd',profiles:[],spokeConnections:[],geminiApiKey:'',addToast:()=>{},
        branchContext:{allBranches:[{id:'branch-uuid',slug:'rekkrd',name:'Rekkrd'}],activeBranchSlugs:['rekkrd']}
      }));</script></body></html>` });
    return route.continue();
  });
  const open = async () => {
    await page.goto(base + '/__creative_brand_fixture__');
    await page.getByRole('button', { name: /Video AI actor/ }).click();
  };
  await open();
  await page.getByText('Rekkrd Brand DNA loaded', { exact: true }).waitFor();
  assert.match(await page.getByLabel('Video focus', { exact: true }).inputValue(), /Introduce Rekkrd/);
  assert.equal(await page.getByLabel('Target Audience', { exact: true }).inputValue(), identity.target_audience);
  assert.equal(await page.getByLabel('Tone', { exact: true }).inputValue(), identity.voice);
  assert.match(await page.getByLabel('Call to Action', { exact: true }).inputValue(), /rekkrd.example.test/);
  assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isEnabled(), true);
  await page.getByLabel('Video focus', { exact: true }).fill('Highlight one feature.');
  await page.getByRole('button', { name: 'Use brand introduction', exact: true }).click();
  assert.match(await page.getByLabel('Video focus', { exact: true }).inputValue(), /Introduce Rekkrd/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), 'creative-studio-brand-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.getByLabel('Video focus', { exact: true }).count(), 0, 'Next advances the wizard');

  mode = 'delayed';
  await open();
  await page.getByLabel('Video focus', { exact: true }).fill('Keep my promotion.');
  await page.getByLabel('Target Audience', { exact: true }).fill('Temporary audience');
  await page.getByLabel('Target Audience', { exact: true }).fill('');
  await page.getByLabel('Tone', { exact: true }).selectOption({ index: 1 });
  const chosenTone = await page.getByLabel('Tone', { exact: true }).inputValue();
  await page.getByLabel('Call to Action', { exact: true }).fill('Join today');
  assert.ok(releaseBrand);
  releaseBrand();
  await page.getByText('Rekkrd Brand DNA loaded', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Video focus', { exact: true }).inputValue(), 'Keep my promotion.');
  assert.equal(await page.getByLabel('Target Audience', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Tone', { exact: true }).inputValue(), chosenTone);
  assert.equal(await page.getByLabel('Call to Action', { exact: true }).inputValue(), 'Join today');

  for (mode of ['missing', 'error']) {
    await open();
    await page.getByText(mode === 'missing' ? 'No active Brand DNA found' : 'Brand DNA could not be loaded', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Video focus', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
    await page.getByLabel('Video focus', { exact: true }).fill('Manual promotion');
    await page.getByLabel('Call to Action', { exact: true }).fill('Learn more');
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isEnabled(), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: saved Brand DNA defaults; editable brief; delayed response preserves edits; missing/error fallback; Next; mobile layout; no browser exceptions.');
} finally {
  await browser.close();
}

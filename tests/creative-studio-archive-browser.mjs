// Run with Vite and PLAYWRIGHT_MODULE as in the other Creative Studio browser tests.
// All database changes below are in-memory fixtures; live traffic is blocked.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const job = (id, status, more = {}) => ({
  id, branch: 'alpha', status, format: 'video', created_at: '2026-10-01T12:00:00Z',
  archived_at: null, publish_status: null, request_payload: { product_description: id }, progress: 0,
  ...more,
});
const rows = [
  job('failed-creative', 'failed'), job('completed-creative', 'completed'),
  job('active-creative', 'generating_script'), job('scheduled-creative', 'completed', { publish_status: 'scheduled' }),
  job('published-creative', 'completed', { publish_status: 'published' }),
  job('beta-creative', 'failed', { branch: 'beta' }),
  job('review-creative', 'awaiting_approval'),
];
let errorMode = '';
let releaseReviewPoll;
let holdReviewPoll = true;
const mutations = [];
const unexpected = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      if (url.pathname.endsWith('/rest/v1/video_ad_jobs')) {
        if (route.request().method() === 'PATCH') {
          const body = route.request().postDataJSON();
          assert.deepEqual(Object.keys(body), ['archived_at'], 'never delete or change generation/publication state');
          const id = url.searchParams.get('id').slice(3);
          const row = rows.find(item => item.id === id);
          assert.equal(url.searchParams.get('branch'), `eq.${row.branch}`, 'mutation is branch-scoped');
          assert.equal(url.searchParams.get('status'), `eq.${row.status}`, 'mutation checks generation state');
          assert.equal(url.searchParams.get('publish_status'), row.publish_status == null ? 'is.null' : `eq.${row.publish_status}`);
          assert.equal(url.searchParams.get('archived_at'), row.archived_at ? `eq.${row.archived_at}` : 'is.null');
          mutations.push({ id, archived_at: body.archived_at });
          if (errorMode === 'permission') return route.fulfill({ status: 403, json: { code: '42501', message: 'Fixture denied' } });
          if (errorMode === 'missing-column') return route.fulfill({ status: 400, json: { code: 'PGRST204', message: 'Fixture missing column' } });
          if (errorMode === 'stale') return route.fulfill({ json: null });
          row.archived_at = body.archived_at;
          return route.fulfill({ json: { id: row.id, archived_at: row.archived_at } });
        }
        assert.equal(route.request().method(), 'GET');
        const id = url.searchParams.get('id')?.slice(3);
        if (id === 'review-creative' && holdReviewPoll) {
          holdReviewPoll = false;
          const staleRow = structuredClone(rows.find(row => row.id === id));
          await new Promise(resolve => { releaseReviewPoll = resolve; });
          return route.fulfill({ json: staleRow });
        }
        return route.fulfill({ json: id ? rows.find(row => row.id === id) : rows.filter(row => `eq.${row.branch}` === url.searchParams.get('branch')) });
      }
      if (url.pathname.endsWith('/rest/v1/brand_identities')) return route.fulfill({ status: 406, json: { code: 'PGRST116' } });
      if (url.pathname.includes('/rest/v1/') && route.request().method() === 'GET') return route.fulfill({ json: [] });
      unexpected.push(route.request().method() + ' ' + url.pathname);
      return route.abort();
    }
    if (url.pathname === '/__archive_fixture__') return route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
      <div id="toast" role="status"></div><div id="root" style="padding:16px"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      await import('/@vite/client');const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const client=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=client.default||client;
      const {default:Panel}=await import('/pages/VideoAdLab.tsx');await import('/index.css');
      window.archiveService=await import('/services/videoAdService.ts');
      const branches=[{id:'alpha',slug:'alpha',name:'Alpha'},{id:'beta',slug:'beta',name:'Beta'}];
      function Harness(){const [slug,setSlug]=React.useState('alpha');return React.createElement(React.Fragment,null,
        React.createElement('button',{onClick:()=>setSlug('beta')},'Switch branch'),
        React.createElement(Panel,{key:slug,selectedBranchSlug:slug,profiles:[],spokeConnections:[],geminiApiKey:'',
          branchContext:{allBranches:branches,activeBranchSlugs:[slug]},addToast:message=>document.getElementById('toast').textContent=message}));}
      createRoot(document.getElementById('root')).render(React.createElement(Harness));
      </script></body></html>` });
    return route.continue();
  });
  const openLibrary = async () => {
    await page.goto(base + '/__archive_fixture__');
    await page.locator('summary').filter({ hasText: 'Browse saved creatives' }).click({ timeout: 60000 });
    await page.getByRole('button', { name: 'Archive creative completed-creative', exact: true }).waitFor();
  };
  await openLibrary();
  // Hold an old review poll across the archive, then deliver it late. It must
  // not overwrite the saved archive timestamp or reappear in the live list.
  assert.ok(releaseReviewPoll);
  await page.getByRole('button', { name: 'Archive creative review-creative', exact: true }).click();
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).waitFor();
  const staleResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('id') === 'eq.review-creative');
  releaseReviewPoll();
  await (await staleResponse).finished();
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Restore creative review-creative', exact: true }).click();
  await page.getByRole('button', { name: 'Archived (0)', exact: true }).waitFor();
  await page.getByRole('button', { name: /^All \(/ }).first().click();
  await page.getByRole('button', { name: 'Archive creative review-creative', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Archive creative active-creative', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Archive creative scheduled-creative', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Archive creative beta-creative', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Archive creative failed-creative', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Archive creative failed-creative', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open creative: failed-creative', exact: true }).count(), 0);
  assert.equal(rows[0].status, 'failed');
  assert.equal(await page.evaluate(async () => (await window.archiveService.getVideoAdJobs('alpha', 100)).some(row => row.id === 'failed-creative')), false, 'default readers exclude archived jobs');
  await openLibrary();
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Restore creative failed-creative', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), 'creative-archive-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Restore creative failed-creative', exact: true }).click();
  await page.getByRole('button', { name: 'Archived (0)', exact: true }).waitFor();
  assert.equal(rows[0].archived_at, null);
  assert.equal(rows[0].status, 'failed');
  await page.getByRole('button', { name: /^All \(/ }).first().click();
  await page.getByRole('button', { name: 'Archive creative failed-creative', exact: true }).waitFor();

  for (const failure of ['permission', 'stale', 'missing-column']) {
    errorMode = failure;
    await page.getByRole('button', { name: 'Archive creative completed-creative', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Refresh') || document.getElementById('toast').textContent.includes('migration'));
    assert.equal(rows[1].archived_at, null);
    assert.equal(await page.getByRole('button', { name: 'Archive creative completed-creative', exact: true }).isEnabled(), true);
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
  }
  errorMode = '';
  await page.getByRole('button', { name: 'Archive creative published-creative', exact: true }).click();
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).waitFor();
  assert.equal(rows[4].publish_status, 'published', 'archive leaves published post state intact');
  await page.getByRole('button', { name: 'Switch branch', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Browse saved creatives' }).click();
  await page.getByRole('button', { name: 'Archive creative beta-creative', exact: true }).click();
  await page.getByRole('button', { name: 'Archived (1)', exact: true }).waitFor();
  assert.equal(mutations.at(-1).id, 'beta-creative');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log('PASS: archive/restore; persistence after reload; default/history exclusion; failed and published records preserve state; active/scheduled guards; permission/stale/schema errors; branch scope; keyboard and mobile; no live writes.');
} finally {
  await browser.close();
}

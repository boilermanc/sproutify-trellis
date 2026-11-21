// Fixture-only Content Studio checks. Start Vite first; external traffic is intercepted.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const branch = { id: 'fixture-branch', slug: 'fixture', name: 'Fixture Garden', is_active: true, website_url: 'https://fixture.invalid', tone: 'friendly', brand_keywords: [] };
const other = { ...branch, id: 'other-branch', slug: 'other', name: 'Other Branch' };
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = [];
 page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });

 await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== base) {
   if (url.pathname.endsWith('/rest/v1/scheduled_social_posts')) return route.fulfill({ json: [{
     id: 'other-post', branch_id: other.id, branch_slug: other.slug, platform: 'instagram', caption: 'Other branch must stay hidden',
     status: url.searchParams.get('status') === 'eq.published' ? 'published' : 'scheduled', media_type: 'image', media_urls: [],
     scheduled_for: '2030-01-01T09:00:00Z', published_at: '2026-09-20T09:00:00Z', created_at: '2026-09-20T09:00:00Z', post_id: null,
    }] });
   if (url.pathname.includes('/rest/v1/')) return route.fulfill({ json: [] });
   if (url.pathname.includes('/functions/v1/')) return route.fulfill({ json: { connections: [], success: true } });
   if (url.pathname.includes('/storage/v1/')) return route.fulfill({ json: { Key: 'fixture.png' } });
   return route.abort();
  }
  if (url.pathname === '/__studio_social_fixture__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@vite/client');
    const reactModule = await import('/node_modules/.vite/deps/react.js'); const React = reactModule.default || reactModule;
    const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = clientModule.default || clientModule;
    const name = new URLSearchParams(location.search).get('page');
    const { default: Panel } = await import('/pages/' + name + '.tsx');
    await import('/index.css');
    const branches = ${JSON.stringify([branch, other])};
    const props = { selectedBranchSlug: 'fixture', branches, branchContext: { allBranches: branches, activeBranchSlugs: ['fixture', 'other'], isAllSelected: true }, profiles: [], socialSignals: [], scheduledPosts: [], deployedCampaigns: [], setEvents: () => {}, setSocialSignals: () => {}, setScheduledPosts: () => {}, addToast: () => {}, onNavigate: () => {}, apiKeys: {} };
    createRoot(document.getElementById('root')).render(React.createElement(Panel, props));
  </script></body></html>` });
  return route.continue();
 });
 async function open(name, heading) {
  await page.goto(base + '/__studio_social_fixture__?page=' + name);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(errors, [], name + ' should render without runtime errors');
  assert.equal(await page.locator('select option').filter({ hasText: 'Other Branch' }).count(), 0, name + ' has no competing branch selector');
 }
 await open('SocialHub', '1. What would you like to share?');
 const notes = page.getByRole('textbox', { name: 'Your notes', exact: true });
 await notes.fill('Keep my existing notes.');
 await page.getByRole('button', { name: /Share a useful tip/ }).click();
 assert.match(await notes.inputValue(), /^Keep my existing notes\.[\s\S]*Share a practical tip/);
 assert.equal(await notes.evaluate(element => element === document.activeElement), true);
 await page.getByText('Help me shape it', { exact: true }).click();
 assert.equal(await page.getByText('Who are you talking to, and what would help or interest them?', { exact: true }).isVisible(), true);
 await page.setViewportSize({ width: 390, height: 844 });
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Social Hub fits mobile width');
 if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_DIR + '/social-hub-mobile.png', fullPage: true });
 await page.setViewportSize({ width: 1280, height: 900 });
 if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_DIR + '/social-hub-desktop.png', fullPage: true });
 const savedNotes = await notes.inputValue();
 await page.getByLabel('Your message to Sage').fill('An idea to finish later');
 await page.getByRole('button', { name: 'Social inbox', exact: true }).click();
 await page.getByRole('button', { name: 'Create a post', exact: true }).click();
 assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'An idea to finish later');
 assert.equal(await notes.inputValue(), savedNotes);
 await page.reload();
 await page.getByRole('heading', { name: '1. What would you like to share?', exact: true }).waitFor();
 assert.equal(await page.getByRole('textbox', { name: 'Your notes', exact: true }).inputValue(), savedNotes);
 assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'An idea to finish later');
 assert.equal(await page.getByRole('heading', { name: 'Intent Watcher' }).count(), 0);
 assert.equal(await page.getByPlaceholder('Optional: tell Sage what this creative is about so it can write better metadata').isVisible(), false);
 await page.getByText('Use an image or video you already have', { exact: true }).click();
 assert.equal(await page.getByPlaceholder('Optional: tell Sage what this creative is about so it can write better metadata').isVisible(), true);
 console.log('PASS SocialHub: focused creation, optional import disclosure, header branch authority');
 await open('PostScheduler', '1. Upload images or videos');
 assert.equal(await page.getByText('2. Set publishing dates', { exact: true }).count(), 0);
 assert.equal(await page.getByRole('heading', { name: /Scheduled Queue/ }).count(), 0);
 assert.equal(await page.getByText('Other branch must stay hidden', { exact: true }).count(), 0);
 await page.locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=', 'base64') });
 await page.getByText('2. Set publishing dates', { exact: true }).waitFor();
 assert.equal(await page.getByText('Optional: add a shared caption', { exact: true }).isVisible(), true);
 console.log('PASS PostScheduler: empty upload start, schedule/caption controls appear after adding media');
 await open('RedditGrowth', '1. Describe your offer');
 assert.equal(await page.getByRole('heading', { name: 'Saved Strategies' }).count(), 0);
 assert.equal(await page.getByRole('heading', { name: '2. Review your strategy' }).count(), 0);
 console.log('PASS RedditGrowth: evidence first, no empty saved strategies or premature review');
 await open('AdPerformance', '1. Import results for this branch');
 assert.equal(await page.getByRole('heading', { name: '2. Compare creative results' }).count(), 0);
 assert.equal(await page.getByRole('button', { name: 'Ask Sage', exact: true }).count(), 0);
 console.log('PASS AdPerformance: import first, empty leaderboard and advisor hidden');
 await open('PostPerformance', 'Post performance');
 await page.getByText('No Instagram posts have published for this branch yet.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Ask Sage', exact: true }).count(), 0);
 assert.equal(await page.locator('select').count(), 0);
 assert.equal(await page.getByText('Other branch must stay hidden', { exact: true }).count(), 0);
 assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) <= 950, 'Post performance empty state is compact');
 console.log('PASS PostPerformance: one compact next-action empty state, no branch filter or empty advisor');
 assert.deepEqual(errors, []);
 console.log('PASS all five pages: no runtime errors; no live network writes');
} finally { await browser.close(); }

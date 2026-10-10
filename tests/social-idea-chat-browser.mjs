// Local fixture only. All external requests are intercepted; no live AI calls or writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3015';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  const prompts = [];
  let historyMode = 'ready';
  let aiMode = 'ready';
  let release;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      if (url.hostname === 'generativelanguage.googleapis.com') {
        prompts.push(JSON.parse(route.request().postData()));
        if (aiMode === 'error') return route.fulfill({ status: 500, body: '{}' });
        if (aiMode === 'delay') await new Promise(resolve => { release = resolve; });
        return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'Try a seedling care tip. Who should it help?' }] } }] } });
      }
      if (url.pathname.endsWith('/rest/v1/marketing_events')) {
        assert.equal(url.searchParams.get('limit'), '12');
        const brand = url.searchParams.get('payload->>branch_id');
        assert.ok(['eq.garden', 'eq.music'].includes(brand));
        if (historyMode === 'error') return route.fulfill({ status: 500, json: { message: 'fixture error' } });
        return route.fulfill({ json: historyMode === 'empty' ? [] : [
          { id: 'recent', source: 'instagram', created_at: '2026-10-01T12:00:00Z', payload: { branch_id: brand.slice(3), caption: 'Seedling launch last week' } },
          { id: 'wrong', source: 'facebook', created_at: '2026-10-02T12:00:00Z', payload: { branch_id: 'unrelated', caption: 'PRIVATE OTHER BRAND' } },
        ] });
      }
      return route.abort();
    }
    if (url.pathname === '/__idea_chat__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@vite/client');
      const r = await import('/node_modules/.vite/deps/react.js'); const React = r.default || r;
      const d = await import('/node_modules/.vite/deps/react-dom_client.js'); const { createRoot } = d.default || d;
      const { default: Chat } = await import('/components/SocialIdeaChat.tsx'); await import('/index.css');
      function App() {
        const [id, setId] = React.useState('garden'); const [notes, setNotes] = React.useState('Keep my notes.');
        return React.createElement('main', { style: { padding: 20 } },
          React.createElement('button', { onClick: () => setId('music') }, 'Switch brand'),
          React.createElement(Chat, { key: id, brand: { id, name: id === 'garden' ? 'Fixture Garden' : 'Fixture Music', tone: 'friendly', description: 'A community brand' }, apiKeys: { active_llm: 'gemini', gemini_api_key: 'fixture-only' }, notes, onUseBrief: text => setNotes(n => n + '\\n' + text) }),
          React.createElement('p', { id: 'notes' }, notes));
      }
      createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>` });
    return route.continue();
  });
  await page.goto(base + '/__idea_chat__');
  await page.getByText('Using 1 recently recorded posts in Trellis.').waitFor();
  await page.getByRole('button', { name: 'Suggest what to post next' }).click();
  await page.getByRole('log').getByText('Try a seedling care tip. Who should it help?').waitFor();
  let context = JSON.parse(prompts[0].contents.at(-1).parts[0].text);
  assert.equal(context.brand.name, 'Fixture Garden');
  assert.equal(context.recentPosts.length, 1);
  assert.equal(context.recentPosts[0].caption, 'Seedling launch last week');
  assert.ok(!JSON.stringify(prompts).includes('PRIVATE OTHER BRAND'));
  await page.getByLabel('Your message to Sage').fill('New growers. My SSN is 123-45-6789.');
  await page.getByRole('button', { name: 'Send to Sage' }).click();
  await page.getByRole('button', { name: 'Prepare a post brief' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#sage-social-message').disabled);
  context = JSON.parse(prompts[1].contents.at(-1).parts[0].text);
  assert.equal(context.conversation.length, 3);
  assert.ok(!JSON.stringify(prompts[1]).includes('123-45-6789'));
  await page.getByRole('button', { name: 'Prepare a post brief' }).click();
  await page.getByLabel('Review your post brief').fill('Teach beginners how to care for seedlings.');
  await page.getByRole('button', { name: 'Add brief to my notes' }).click();
  assert.equal(await page.locator('#notes').textContent(), 'Keep my notes.\nTeach beginners how to care for seedlings.');
  aiMode = 'error';
  await page.getByLabel('Your message to Sage').fill('Please refine this');
  await page.getByRole('button', { name: 'Send to Sage' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'Please refine this');
  aiMode = 'delay';
  await page.getByRole('button', { name: 'Send to Sage' }).click();
  while (!release) await new Promise(resolve => setTimeout(resolve, 20));
  await page.getByRole('button', { name: 'Switch brand' }).click();
  release();
  await page.getByText('Fixture Music', { exact: true }).waitFor();
  assert.equal(await page.getByRole('log').innerText(), '');
  assert.equal(await page.getByLabel('Review your post brief').count(), 0);
  historyMode = 'error';
  await page.reload();
  await page.getByRole('button', { name: 'Retry recent posts' }).waitFor();
  historyMode = 'empty';
  await page.getByRole('button', { name: 'Retry recent posts' }).click();
  await page.getByText('No published posts recorded in Trellis for this brand yet. Sage will start with your brand details.').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_DIR + '/sage-chat-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS brand context, scoped history, multi-turn chat, sanitization, editable brief handoff, AI failure, branch-switch race, history failure/retry/empty, mobile layout');
} finally { await browser.close(); }

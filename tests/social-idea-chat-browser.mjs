// Local fixture only. All external requests are intercepted; no live AI calls or writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3015';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.setDefaultTimeout(60000);
  page.on('console', msg => { if (msg.type() === 'error') console.error('Browser:', msg.text()); });
  page.on('requestfailed', req => console.error('Request failed:', new URL(req.url()).pathname, req.failure()?.errorText));
  const errors = [];
  const prompts = [];
  let historyMode = 'ready';
  let aiMode = 'ready';
  let release;
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      if (url.pathname.endsWith('/functions/v1/ai-generate')) {
        prompts.push(JSON.parse(route.request().postData()));
        if (aiMode === 'error') return route.fulfill({ status: 500, body: '{}' });
        if (aiMode === 'delay') await new Promise(resolve => { release = resolve; });
        return route.fulfill({ json: { text: 'Try a seedling care tip. Who should it help?', provider: 'gemini' } });
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
    return route.continue();
  });
  await page.goto(base + '/tests/fixtures/social-idea-chat.html');
  await page.getByLabel('Post notes').fill('Keep my notes.');
  await page.getByText('Using 1 recently recorded posts in Trellis.').waitFor();
  await page.getByRole('button', { name: 'Suggest what to post next' }).click();
  await page.getByRole('log').getByText('Try a seedling care tip. Who should it help?').waitFor();
  let context = JSON.parse(prompts[0].prompt);
  assert.equal(context.brand.name, 'Fixture Garden');
  assert.equal(context.recentPosts.length, 1);
  assert.equal(context.recentPosts[0].caption, 'Seedling launch last week');
  assert.ok(!JSON.stringify(prompts).includes('PRIVATE OTHER BRAND'));
  await page.getByLabel('Your message to Sage').fill('New growers. My SSN is 123-45-6789.');
  await page.getByRole('button', { name: 'Send to Sage' }).click();
  await page.getByRole('button', { name: 'Prepare a post brief' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#sage-social-message').disabled);
  context = JSON.parse(prompts[1].prompt);
  assert.equal(context.conversation.length, 3);
  assert.ok(!JSON.stringify(prompts[1]).includes('123-45-6789'));
  await page.getByRole('button', { name: 'Prepare a post brief' }).click();
  await page.getByLabel('Review your post brief').fill('Teach beginners how to care for seedlings.');
  await page.getByRole('button', { name: 'Add brief to my notes' }).click();
  assert.equal(await page.locator('#notes').textContent(), 'Keep my notes.\nTeach beginners how to care for seedlings.');
  await page.getByLabel('Your message to Sage').fill('Unfinished thought for tomorrow');
  const savedConversation = await page.getByRole('log').innerText();
  await page.getByRole('button', { name: 'Toggle chat view' }).click();
  await page.getByRole('button', { name: 'Toggle chat view' }).click();
  assert.equal(await page.getByRole('log').innerText(), savedConversation);
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'Unfinished thought for tomorrow');
  await page.reload();
  assert.equal(await page.getByRole('log').innerText(), savedConversation);
  assert.equal(await page.getByLabel('Review your post brief').inputValue(), 'Teach beginners how to care for seedlings.');
  assert.equal(await page.getByLabel('Post notes').inputValue(), 'Keep my notes.\nTeach beginners how to care for seedlings.');
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'Unfinished thought for tomorrow');
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('123-45-6789'));
  await page.getByText('Using 1 recently recorded posts in Trellis.').waitFor();
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
  assert.equal(await page.getByLabel('Post notes').inputValue(), '');
  await page.getByLabel('Post notes').fill('Music notes stay separate');
  await page.getByLabel('Your message to Sage').fill('A music idea');
  await page.getByRole('button', { name: 'Return to garden' }).click();
  assert.equal(await page.getByRole('log').innerText(), savedConversation);
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'Please refine this');
  assert.equal(await page.getByLabel('Review your post brief').inputValue(), 'Teach beginners how to care for seedlings.');
  assert.equal(await page.getByLabel('Post notes').inputValue(), 'Keep my notes.\nTeach beginners how to care for seedlings.');
  await page.getByRole('button', { name: 'Switch brand' }).click();
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'A music idea');
  assert.equal(await page.getByLabel('Post notes').inputValue(), 'Music notes stay separate');
  historyMode = 'error';
  await page.reload();
  await page.getByRole('button', { name: 'Retry recent posts' }).waitFor();
  historyMode = 'empty';
  await page.getByRole('button', { name: 'Retry recent posts' }).click();
  await page.getByText('No published posts recorded in Trellis for this brand yet. Sage will start with your brand details.').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT_DIR + '/sage-chat-mobile.png', fullPage: true });
  await page.evaluate(() => localStorage.setItem('trellis_social_idea_v1:garden:messages', '{invalid'));
  await page.reload();
  await page.getByText('Your chat could not be saved or restored.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('log').innerText(), '');
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('trellis_social_idea_v1:')) throw new DOMException('Fixture quota exceeded', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.getByLabel('Your message to Sage').fill('Keep this even if saving fails');
  assert.equal(await page.getByLabel('Your message to Sage').inputValue(), 'Keep this even if saving fails');
  await page.getByText('Your chat could not be saved or restored.', { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS chat/brief/notes/unfinished-message restoration after navigation and reload; brand isolation; failed storage; brand context, scoped history, multi-turn chat, sanitization, brief handoff, AI failure, branch-switch race, history retry, mobile');
} finally { await browser.close(); }

// Vite fixture uses the real page, repository reader and Gemini adapter.
// Every remote request is intercepted; no media generation or live writes occur.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const branches = [
  { id: 'orchard-id', slug: 'orchard', name: 'Fixture Orchard', website_url: 'https://orchard.example' },
  { id: 'audio-id', slug: 'audio', name: 'Fixture Audio', website_url: 'https://audio.example' },
];
const brandFor = slug => ({
  id: `${slug}-dna`, branch_id: slug, status: 'active',
  mission: slug === 'orchard' ? 'Teach orchard growing.' : 'Help people enjoy listening.',
  target_audience: `${slug} audience`, voice: `${slug} voice`, marketing_hooks: [`Explore ${slug}`],
});
const jobsFor = slug => [
  ...['published', 'scheduled', null].map((publish_status, index) => ({
    id: `${slug}-${index}`, branch: slug, format: 'static', status: 'completed',
    created_at: `2026-10-0${9 - index}T12:00:00Z`, publish_status,
    request_payload: { message: `${slug} recent ${index}` },
    thumbnail_url: 'https://images.example/fixture.svg', caption: `${slug} caption`, progress: 100,
  })),
  { id: 'foreign', branch: slug === 'orchard' ? 'audio' : 'orchard', status: 'completed', created_at: '2026-10-10T12:00:00Z', request_payload: { message: 'FOREIGN HISTORY' } },
  { id: 'backdrop', branch: slug, status: 'completed', created_at: '2026-10-10T12:00:00Z', request_payload: { message: 'CARD BACKGROUND', purpose: 'card_background' } },
];
const ideasFor = (slug, format) => ({ ideas: [1, 2, 3].map(index => ({
  title: `${slug} ${format} idea ${index}`, format, hook: `${slug} ${format} hook ${index}`,
  brief: `Create a ${format} about ${slug}'s saved purpose, angle ${index}.`, rationale: `Explore a ${format} angle for ${slug}'s audience.`,
})) });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  const loadFailures = [];
  const pendingLoads = new Set();
  page.on('request', request => pendingLoads.add(new URL(request.url()).pathname));
  page.on('requestfinished', request => pendingLoads.delete(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => loadFailures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 500) loadFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  let mode = 'normal';
  let releaseOld;
  let aiCalls = 0;
  let submittedVideo;
  let submittedRender;
  let videoJob;
  const contexts = [];
  const unexpected = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'images.example') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#059669"/></svg>' });
    if (url.hostname === 'generativelanguage.googleapis.com') {
      aiCalls++;
      const body = route.request().postDataJSON();
      const prompt = body.contents.flatMap(content => content.parts).map(part => part.text || '').join('');
      const context = JSON.parse(prompt.split('CONTEXT:\n')[1]);
      contexts.push(context);
      assert.ok(context.recent.every(item => item.title.startsWith(context.branch)));
      assert.ok(!prompt.includes('FOREIGN HISTORY'));
      assert.ok(!prompt.includes('CARD BACKGROUND'));
      if (mode === 'delayed' && context.branch === 'orchard' && context.format === 'video') await new Promise(resolve => { releaseOld = resolve; });
      if (mode === 'failure') return route.fulfill({ status: 400, json: { error: { code: 400, message: 'Fixture failure', status: 'INVALID_ARGUMENT' } } });
      const text = mode === 'malformed' ? '{"ideas":[]}' : JSON.stringify(ideasFor(context.branch, mode === 'wrong-format' ? 'static' : context.format));
      return route.fulfill({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] } }).catch(() => {});
    }
    if (url.hostname === 'n8n.sproutify.app') {
      const payload=route.request().postDataJSON();
      if(url.pathname.endsWith('/trellis-video-ad-generate')) {
        submittedVideo=payload;
        videoJob={...jobsFor('orchard')[0],id:payload.job_id,format:'video',status:'awaiting_approval',progress:50,publish_status:null,script:payload.script,frame_url:'https://images.example/frame.png',duration_seconds:payload.video_duration,request_payload:payload};
        return route.fulfill({json:{accepted:true}});
      }
      if(url.pathname.endsWith('/trellis-video-ad-render')) {submittedRender=payload;return route.fulfill({json:{accepted:true}});}
    }
    if (url.origin !== base) {
      if (url.pathname.endsWith('/rest/v1/brand_identities')) {
        const slug = url.searchParams.get('branch_id').replace('eq.', '');
        if (mode === 'empty') return route.fulfill({ status: 406, json: { code: 'PGRST116' } });
        return route.fulfill({ json: brandFor(slug) });
      }
      if (url.pathname.endsWith('/rest/v1/video_ad_jobs')) {
        if(route.request().method()==='PATCH'){
          const patch=route.request().postDataJSON();
          assert.equal(url.searchParams.get('status'),'eq.awaiting_approval');
          assert.equal(url.searchParams.get('frame_url'),'eq.'+videoJob.frame_url);
          assert.equal(url.searchParams.get('script'),'eq.'+videoJob.script);
          videoJob={...videoJob,...patch};
          return route.fulfill({json:{id:videoJob.id,frame_url:videoJob.frame_url,frame_approved_at:videoJob.frame_approved_at}});
        }
        if(videoJob&&url.searchParams.has('id'))return route.fulfill({json:videoJob});
        if (mode === 'history-failure') return route.fulfill({ status: 403, json: { message: 'Fixture unavailable' } });
        const slug = (url.searchParams.get('branch') || 'eq.orchard').replace('eq.', '');
        return route.fulfill({ json: mode === 'empty' ? [] : [...(videoJob?[videoJob]:[]),...jobsFor(slug)] });
      }
      if (url.pathname.includes('/rest/v1/') && route.request().method() === 'GET') return route.fulfill({ json: [] });
      unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === '/__creative_ideas_fixture__') return route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
      <div id="root" style="padding:16px;max-width:1400px;margin:auto"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      await import('/@vite/client');const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const client=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=client.default||client;
      const {default:Panel}=await import('/pages/VideoAdLab.tsx');await import('/index.css');
      window.draftChanges=0;window.addEventListener('studio-draft-change',()=>window.draftChanges++);
      const branches=${JSON.stringify(branches)};
      function Harness(){const [slug,setSlug]=React.useState('orchard');return React.createElement(React.Fragment,null,
        React.createElement('button',{onClick:()=>setSlug('audio')},'Switch to audio'),
        React.createElement(Panel,{key:slug,selectedBranchSlug:slug,profiles:[],spokeConnections:[],
          geminiApiKey:${JSON.stringify(mode === 'no-key' || mode === 'empty' ? '' : 'fixture-key')},addToast:()=>{},
          branchContext:{allBranches:branches,activeBranchSlugs:[slug]}}));}
      createRoot(document.getElementById('root')).render(React.createElement(Harness));
      </script></body></html>` });
    return route.continue();
  });
  const panel = page.getByRole('region', { name: 'Creative starting points' });
  const open = async (nextMode = 'normal') => {
    mode = nextMode;
    await page.goto(base + '/__creative_ideas_fixture__');
    try {
      await panel.getByRole('button', { name: /^Use this idea:/ }).first().waitFor();
    } catch (error) {
      console.error({ errors, loadFailures, pendingLoads: [...pendingLoads], unexpected, aiCalls, body: (await page.locator('body').innerText()).slice(0, 3000) });
      throw error;
    }
  };
  await open();
  assert.equal(await panel.getByRole('article').count(), 3);
  assert.equal(await panel.getByRole('button', { name: /^Open creative:/ }).count(), 3);
  for (const status of ['Published', 'Scheduled', 'Draft · ready']) await panel.getByText(status, { exact: true }).waitFor();
  assert.equal(await panel.getByText('FOREIGN HISTORY').count(), 0);
  assert.equal(contexts.at(-1).audience, 'orchard audience');
  assert.equal(contexts.at(-1).summary, 'Teach orchard growing.');
  await page.screenshot({ path: join(tmpdir(), 'creative-studio-ideas-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), 'creative-studio-ideas-mobile.png'), fullPage: true });

  const callsBeforeUse = aiCalls;
  await panel.getByRole('button', { name: 'Use this idea: orchard video idea 1', exact: true }).click();
  assert.match(await page.getByLabel('Video focus', { exact: true }).inputValue(), /orchard video hook/);
  assert.equal(await page.getByLabel('Target Audience', { exact: true }).inputValue(), 'orchard audience');
  assert.equal(await page.getByLabel('Tone', { exact: true }).inputValue(), 'orchard voice');
  assert.match(await page.getByLabel('Call to Action', { exact: true }).inputValue(), /orchard.example/);
  assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isEnabled(), true);
  assert.ok(await page.evaluate(() => window.draftChanges > 0));
  await page.getByLabel('Video focus', { exact: true }).fill('Keep my edits');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Use this idea: orchard video idea 2', exact: true }).click();
  assert.equal(await panel.isVisible(), true, 'cancel replacement stays on ideas');
  await page.getByRole('button', { name: /Video AI actor/ }).click();
  assert.equal(await page.getByLabel('Video focus', { exact: true }).inputValue(), 'Keep my edits');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Use this idea: orchard video idea 2', exact: true }).click();
  assert.match(await page.getByLabel('Video focus', { exact: true }).inputValue(), /orchard video hook 2/);
  await page.getByText('Creating: Video', { exact: true }).waitFor();
  assert.equal(aiCalls, callsBeforeUse, 'wizard navigation reuses suggestions for the selected format');
  for (const [format, picker, label, field] of [
    ['static', /Static Image Single/, 'Image', 'Message / Offer'],
    ['carousel', /Carousel 3/, 'Carousel', 'Topic'],
  ]) {
    await page.getByRole('button', { name: 'Change format', exact: true }).click();
    await page.getByRole('button', { name: picker }).click();
    await page.getByText('Creating: ' + label, { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Use this idea: orchard ' + format + ' idea 1', exact: true }).waitFor();
    assert.equal(await panel.getByRole('article').count(), 3);
    assert.equal(contexts.at(-1).format, format);
    for (const article of await panel.getByRole('article').all()) assert.match(await article.innerText(), new RegExp(format === 'static' ? 'Static image' : 'Carousel'));
    page.once('dialog', dialog => dialog.accept());
    await panel.getByRole('button', { name: 'Use this idea: orchard ' + format + ' idea 1', exact: true }).click();
    assert.match(await page.getByLabel(field, { exact: true }).inputValue(), new RegExp('orchard ' + format + ' hook'));
    await page.getByText('Creating: ' + label, { exact: true }).waitFor();
    await page.screenshot({ path: join(tmpdir(), 'creative-format-' + format + '.png'), fullPage: true });
  }
  const beforeRefresh = aiCalls;
  await panel.getByRole('button', { name: 'Refresh ideas', exact: true }).click();
  await panel.getByRole('button', { name: /^Use this idea:/ }).first().waitFor();
  assert.equal(aiCalls, beforeRefresh + 1);

  await page.getByRole('button', { name: 'Switch to audio', exact: true }).click();
  await panel.getByRole('button', { name: 'Use this idea: audio video idea 1', exact: true }).waitFor();
  assert.equal(await panel.getByText(/orchard recent/).count(), 0);
  assert.equal(contexts.at(-1).audience, 'audio audience');
  await panel.getByRole('button', { name: 'Open creative: audio recent 0', exact: true }).click();
  assert.equal(await panel.isVisible(), false, 'history opens the existing review surface');

  mode = 'delayed';
  const pendingRequest = page.waitForRequest(request => request.url().includes('generativelanguage.googleapis.com'));
  await page.goto(base + '/__creative_ideas_fixture__');
  await pendingRequest;
  await page.getByRole('button', { name: 'Switch to audio', exact: true }).click();
  await panel.getByRole('button', { name: 'Use this idea: audio video idea 1', exact: true }).waitFor();
  assert.ok(releaseOld); releaseOld();
  assert.equal(await panel.getByRole('button', { name: /Use this idea: orchard/ }).count(), 0);

  mode = 'delayed';
  const oldFormatRequest = page.waitForRequest(request => request.url().includes('generativelanguage.googleapis.com'));
  await page.goto(base + '/__creative_ideas_fixture__');
  await oldFormatRequest;
  await page.getByRole('button', { name: /Static Image Single/ }).click();
  await panel.getByRole('button', { name: 'Use this idea: orchard static idea 1', exact: true }).waitFor();
  releaseOld();
  await page.getByText('Creating: Image', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: /Use this idea: orchard video/ }).count(), 0);

  for (const fallbackMode of ['failure', 'malformed', 'wrong-format', 'no-key', 'empty']) {
    await open(fallbackMode);
    assert.equal(await panel.getByRole('article').count(), 3);
    await panel.getByRole('button', { name: 'Use this idea: Meet Fixture Orchard', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isEnabled(), true);
  }
  await open('history-failure');
  assert.equal(contexts.at(-1).historyAvailable, false);
  assert.deepEqual(contexts.at(-1).recent, []);
  await panel.getByRole('button', { name: 'Retry history', exact: true }).waitFor();
  mode = 'normal';
  await panel.getByRole('button', { name: 'Retry history', exact: true }).click();
  await panel.getByRole('button', { name: 'Open creative: orchard recent 0', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Use this idea: orchard video idea 1', exact: true }).waitFor();
  assert.equal(contexts.at(-1).historyAvailable, true);
  await open('no-key');
  await panel.getByRole('button',{name:'Use this idea: Meet Fixture Orchard',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByLabel('Video duration',{exact:true}).selectOption('10');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const edited='Meet our brand. Explore something new today.';
  await page.getByLabel('Spoken video script',{exact:true}).fill(edited);
  await page.getByRole('button',{name:'Create Frame for Approval',exact:true}).click();
  await page.getByRole('button',{name:'Approve & Render',exact:true}).first().waitFor({timeout:30000});
  assert.equal(submittedVideo.script,edited);assert.equal(submittedVideo.video_duration,10);
  assert.equal(submittedRender,undefined,'No video is requested before frame approval');
  const rendered=page.waitForResponse(response=>response.url().endsWith('/trellis-video-ad-render'));
  await page.getByRole('button',{name:'Approve & Render',exact:true}).first().click();
  await rendered;
  assert.equal(submittedRender.job_id,submittedVideo.job_id);assert.equal(submittedRender.frame_url,videoJob.frame_url);assert.equal(submittedRender.frame_approved_at,videoJob.frame_approved_at);
  assert.equal(videoJob.script,edited,'Approval preserves the edited script');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, [], 'no live generation, database mutation or publishing');
  console.log('PASS: three generated ideas; scoped history/statuses; all format handoffs; draft replacement/cancellation; refresh; no repeated generation on Back; brand switch and stale response isolation; failure/malformed/no-key/empty fallbacks; history retry; mobile; no browser exceptions or live writes.');
} finally {
  await browser.close();
}

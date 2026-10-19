import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, extra = {}) {
  const context = { exports: {}, URL, Response, Request, AbortSignal, fetch, ...extra };
  vm.runInNewContext(ts.transpile(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  return context.exports;
}
const domain = load('../supabase/functions/tiktok-metrics/domain.ts');
const id = '7698435240997489950';
test('video IDs retain full precision and input cannot redirect the API caller', () => {
  assert.equal(domain.videoId(`https://www.tiktok.com/@sproutifytheapp/video/${id}?foo=1`), id);
  assert.equal(domain.videoId(id), id);
  for (const input of [Number(id), 'https://evil.test/@name/video/' + id, 'https://www.tiktok.com.evil.test/@x/video/' + id, 'http://www.tiktok.com/@x/video/' + id, 'https://vm.tiktok.com/abc', 'abc']) assert.throws(() => domain.videoId(input));
});
test('metrics distinguish unavailable from zero; never coerce invalid counts', () => {
  const result = domain.normalizeVideo({ id, view_count: 0, like_count: -1, comment_count: '2', share_count: 4, share_url: 'https://evil.test' }, id);
  assert.equal(result.views, 0); assert.equal(result.likes, null); assert.equal(result.comments, null); assert.equal(result.shares, 4); assert.equal(result.share_url, null);
  assert.throws(() => domain.normalizeVideo({ id: 'other' }, id));
  assert.equal(domain.hasVideoReadScope(['video.publish', 'video.upload']), false);
  assert.equal(domain.hasVideoReadScope(['video.list']), true);
});
test('queries only the fixed read endpoint and ignores unexpected IDs', async () => {
  let request;
  const result = await domain.queryVideos('test-only-token', [id], async (url, options) => {
    request = { url, options };
    return Response.json({ error: { code: 'ok' }, data: { videos: [{ id, view_count: 10 }, { id: 'other', view_count: 99 }] } });
  });
  assert.equal(new URL(request.url).pathname, '/v2/video/query/');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body).filters.video_ids, [id]);
  assert.equal(result.length, 1); assert.equal(result[0].views, 10);
});
test('permission/API failures and malformed results never become zero snapshots', async () => {
  for (const body of [{ error: { code: 'scope_not_authorized' } }, { data: { videos: [] } }, { error: { code: 'ok' }, data: {} }]) {
    await assert.rejects(domain.queryVideos('test', [id], async () => Response.json(body)));
  }
  await assert.rejects(domain.queryVideos('test', Array(21).fill(id)));
});

function handlerHarness({ role = 'owner', authStatus, rows = [], videos = [] } = {}) {
  let handler, rpcCalls = 0, apiCalls = 0;
  const mutations = [];
  const db = { from(table) {
    const response = rows.shift() || { data: null };
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'then') return Promise.resolve(response).then.bind(Promise.resolve(response));
      return (...args) => { if (['insert','update','upsert'].includes(key)) mutations.push({ table, key, args }); return chain; };
    } });
    return chain;
  }, async rpc() { rpcCalls++; return { data: { success: true, credential_id: 'owner', access_token: 'test-only-token' } }; } };
  load('../supabase/functions/tiktok-metrics/index.ts', {
    Deno: { serve(fn) { handler = fn; } },
    require(name) {
      if (name === './domain.ts') return { ...domain, queryVideos: async () => { apiCalls++; return videos; } };
      return { adminClient: () => db, SERVICE_KEY: 'worker-secret', secureEqual: (a,b) => a === b,
        cors: {}, json: (body, status = 200) => Response.json(body, { status }),
        requireTrellisUser: async () => authStatus ? Response.json({ error: 'denied' }, { status: authStatus }) : { userId: 'u', role } };
    },
  });
  return { request: async body => handler(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer user' }, body: JSON.stringify(body) })), mutations, stats: () => ({ rpcCalls, apiCalls }) };
}
const branch = '60cce7e5-43b9-48b1-9bb6-9ae3edd64087';
const own = { data: { id: 'owner', status: 'active' } };
const owner = { data: { id: 'owner', status: 'active', platform_user_id: 'account', granted_scopes: ['video.list'] } };
test('unauthenticated and unassigned callers are blocked before token lookup', async () => {
  for (const options of [{ authStatus: 401 }, { role: 'operator', rows: [{ data: { id: 'u' } }, { data: null }] }]) {
    const h = handlerHarness(options);
    assert.ok([401,403].includes((await h.request({ action: 'sync', branch_id: branch })).status));
    assert.equal(h.stats().rpcCalls, 0); assert.equal(h.stats().apiCalls, 0);
  }
});
test('missing read scope stops before secrets and external calls', async () => {
  const h = handlerHarness({ rows: [own, { data: { ...owner.data, granted_scopes: ['video.publish'] } }] });
  const result = await h.request({ action: 'sync', branch_id: branch });
  assert.equal(result.status, 400); assert.match((await result.json()).error, /video.list/);
  assert.equal(h.stats().rpcCalls, 0); assert.equal(h.stats().apiCalls, 0);
});
test('a shared-account post cannot be assigned to both Home and Farm', async () => {
  const h = handlerHarness({ rows: [own, owner, { data: { id: 'post', branch_id: 'farm', account_id: 'account' } }], videos: [{ video_id: id }] });
  assert.equal((await h.request({ action: 'track', branch_id: branch, video_url: id })).status, 409);
  assert.equal(h.mutations.length, 0);
});
test('unavailable videos retain their existing metrics and report an error', async () => {
  const h = handlerHarness({ rows: [own, owner, { data: [{ id: 'post', video_id: id, credential_id: 'owner', account_id: 'account' }] }, { data: null }], videos: [] });
  const result = await (await h.request({ action: 'sync', branch_id: branch })).json();
  assert.equal(result.unavailable, 1); assert.equal(result.refreshed, 0);
  assert.deepEqual(Object.keys(h.mutations[0].args[0]), ['last_error']);
});
test('operators cannot invoke the worker-wide sync', async () => {
  const h = handlerHarness();
  assert.equal((await h.request({ action: 'sync_all' })).status, 403);
  assert.equal(h.stats().rpcCalls, 0);
});
test('metrics workflow stays separate from publishing and requires a server credential', () => {
  const workflow = JSON.parse(fs.readFileSync(new URL('../n8n-blueprints/T2-tiktok-metrics-sync.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  const request = workflow.nodes.find(node => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(request.parameters.url, 'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/tiktok-metrics');
  assert.equal(request.parameters.authentication, 'predefinedCredentialType');
  assert.equal(workflow.nodes.some(node => node.type.includes('webhook')), false);
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  const source = fs.readFileSync(new URL('../supabase/functions/tiktok-metrics/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /scheduled_social_posts|trellis-tiktok-publish|\/post\/publish\//);
});

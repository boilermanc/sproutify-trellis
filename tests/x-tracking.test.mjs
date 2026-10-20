import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import * as domain from '../supabase/functions/x-tracking/domain.mjs';

const id = '1848765432109876543';
const post = { id, author_id: '123', text: 'Across our projects', created_at: '2026-10-20T12:00:00Z', public_metrics: { like_count: 0, impression_count: 123 } };
test('only verified boilermanc can connect; stored immutable identity also checked', () => {
  assert.equal(domain.verifyIdentity({ id: '123', username: 'Boilermanc' }), '123');
  for (const user of [{ id: '123', username: 'someone' }, { id: '456', username: 'boilermanc' }, { username: 'boilermanc' }]) {
    assert.throws(() => domain.verifyIdentity(user, '123'));
  }
});
test('metrics preserve zero and missing values, post IDs never lose precision', () => {
  const result = domain.normalizePost(post, '123');
  assert.equal(result.post_id, id);
  assert.equal(result.metrics.like_count, 0);
  assert.equal(result.metrics.reply_count, null);
  assert.equal(result.is_own, true);
  assert.equal(domain.normalizePost(post, '456').is_own, false);
  assert.throws(() => domain.normalizePost({ ...post, created_at: 'invalid' }, '123'));
});
test('multiple project tags are validated and deduplicated; empty stays unassigned', () => {
  assert.deepEqual(domain.validateTags(['a', 'b', 'a'], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(domain.validateTags([], ['a']), []);
  for (const tags of [null, 'a', ['unknown'], [123]]) assert.throws(() => domain.validateTags(tags, ['a']));
});
test('bounded pagination preserves lower bound until the last page, including large IDs', () => {
  const since = '1848765432109876500';
  const params = domain.timelineParams({ since_id: since });
  assert.equal(params.get('since_id'), since);
  const next = domain.advanceCursor({ since_id: since }, { data: [post], meta: { next_token: 'page2' } }, null);
  assert.equal(next.since_id, since);
  assert.equal(next.high_id, id);
  assert.equal(domain.timelineParams(next).get('pagination_token'), 'page2');
  assert.deepEqual(domain.advanceCursor(next, { data: [{ id: '1848765432109876501' }] }, null), { since_id: id });
});
test('empty first poll keeps initial lower bound rather than skipping late arrivals', () => {
  const params = domain.timelineParams({}, new Date('2026-10-20T00:00:00Z'));
  assert.equal(params.get('start_time'), '2026-09-20T00:00:00.000Z');
  assert.deepEqual(domain.advanceCursor({}, { meta: {} }, params.get('start_time')), { start_time: params.get('start_time') });
});
test('API rate limits and partial timeline results stop cursor advancement', async () => {
  await assert.rejects(domain.xGet('users/123/tweets', 'fixture', async () => new Response('', { status: 429 })), /rate limit/);
  await assert.rejects(domain.xGet('users/123/tweets', 'fixture', async () => Response.json({ data: [post], errors: [{ detail: 'private' }] })), /partial/);
  const response = await domain.xGet('tweets', 'fixture', async () => Response.json({ errors: [{ type: 'https://api.twitter.com/2/problems/resource-not-found' }] }), true);
  assert.equal(response.errors.length, 1);
  await assert.rejects(domain.xGet('tweets', 'fixture', async () => Response.json({ errors: [{ type: 'upstream-error' }] }), true));
});

function load(file, imports, extra = {}) {
  const context = { exports: {}, URL, URLSearchParams, Response, Request, AbortSignal, fetch, crypto: webcrypto, btoa, atob, TextEncoder, TextDecoder,
    require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, ...extra };
  vm.runInNewContext(ts.transpile(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }), context);
  return context.exports;
}
function database(responses = []) {
  const calls = [], records = [];
  const db = { from(table) {
    const response = responses.shift() || { data: null };
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'then') return Promise.resolve(response).then.bind(Promise.resolve(response));
      return (...args) => { calls.push({ table, method: key, args }); return chain; };
    } });
    return chain;
  }, async rpc(name, args) { records.push({ name, args }); return { error: null }; } };
  return { db, calls, records };
}
function handlerHarness({ role = 'owner', responses = [], accountRow = {}, domainOverrides = {} } = {}) {
  const store = database(responses);
  let collections = 0, exchanges = 0;
  const runtime = {
    db: store.db, account: async () => accountRow, hash: async value => value,
    decrypt: async value => value, encrypt: async value => value,
    tokenFields: async () => ({}), callbackUrl: 'https://fixture.test/callback', appConfig: () => ({ id: 'fixture' }),
    exchange: async () => { exchanges++; return { access_token: 'fixture', refresh_token: 'fixture' }; },
  };
  const exports = load('../supabase/functions/x-tracking/index.ts', {
    '../_shared/posthog.ts': { cors: {}, SERVICE_KEY: 'worker', secureEqual: (a,b) => a === b,
      json: (body,status = 200) => Response.json(body,{status}),
      requireTrellisUser: async (req, roles) => roles.includes(role) ? { role, userId: 'fixture' } : Response.json({}, { status: role === 'anonymous' ? 401 : 403 }) },
    './runtime.ts': runtime, './domain.mjs': { ...domain, ...domainOverrides },
    './collector.ts': { collect: async () => { collections++; return { collected: 1 }; } },
  }, { Deno: { serve() {} } });
  return { ...store, stats: () => ({ collections, exchanges }), request: (body, token = 'user') =>
    exports.handle(new Request('https://fixture.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })),
    callback: () => exports.handle(new Request(`https://fixture.test/callback?code=fixture&state=${'a'.repeat(72)}`)) };
}
test('anonymous and branch-restricted users cannot read or mutate shared account data', async () => {
  for (const role of ['anonymous', 'operator', 'viewer']) {
    const h = handlerHarness({ role });
    for (const action of ['list','connect','sync','tag','status','history']) assert.ok([401,403].includes((await h.request({ action })).status));
    assert.equal(h.calls.length, 0); assert.equal(h.stats().collections, 0);
  }
});
test('worker is restricted to sync, owners may sync', async () => {
  const h = handlerHarness();
  assert.equal((await h.request({ action: 'list' }, 'worker')).status, 403);
  assert.equal((await h.request({ action: 'sync' }, 'worker')).status, 200);
  assert.equal((await h.request({ action: 'sync' })).status, 200);
  assert.equal(h.stats().collections, 2);
});
test('callback replay/expired state rejected before token exchange', async () => {
  const h = handlerHarness({ responses: [{ data: null }] });
  assert.equal((await h.callback()).status, 400);
  assert.equal(h.stats().exchanges, 0);
});
test('wrong account cannot overwrite shared connection', async () => {
  const h = handlerHarness({ responses: [{ data: { verifier_encrypted: 'fixture' } }],
    domainOverrides: { xGet: async () => ({ data: { id: '123', username: 'wrong' } }) } });
  assert.equal((await h.callback()).status, 400);
  assert.equal(h.calls.some(call => call.method === 'update'), false);
});
test('list response never exposes encrypted tokens or account secrets', async () => {
  const h = handlerHarness({ accountRow: { platform_user_id: '123', access_token_encrypted: 'DO_NOT_EXPOSE', refresh_token_encrypted: 'DO_NOT_EXPOSE' },
    responses: [{ data: [], count: 0 }, { data: [] }] });
  const response = await h.request({ action: 'list' });
  const text = await response.text();
  assert.doesNotMatch(text, /DO_NOT_EXPOSE|access_token|refresh_token/);
  assert.equal(JSON.parse(text).account.connected, true);
});
test('collector lease blocks overlapping calls before accessing X', async () => {
  const store = database([{ data: [] }]);
  let tokens = 0;
  const { collect } = load('../supabase/functions/x-tracking/collector.ts', {
    './runtime.ts': { db: store.db, account: async () => ({ id: 'account' }), accessToken: async () => { tokens++; } },
    './domain.mjs': domain,
  });
  await assert.rejects(collect(), /already running/);
  assert.equal(tokens, 0);
});
test('collector persists snapshots before cursor and preserves partial failures for retry', async () => {
  const store = database([{ data: [{ id: 'account' }] }]);
  store.db.rpc = async () => ({ error: { message: 'fixture write failure' } });
  const { collect } = load('../supabase/functions/x-tracking/collector.ts', {
    './runtime.ts': { db: store.db, account: async () => ({ id: 'account', platform_user_id: '123' }), accessToken: async () => 'fixture' },
    './domain.mjs': { ...domain, xGet: async () => ({ data: [post] }) },
  });
  await assert.rejects(collect(), /batch will be retried/);
  const updates = store.calls.filter(call => call.method === 'update').map(call => call.args[0]);
  assert.equal(updates.some(update => 'posts_cursor' in update), false);
  assert.ok(updates.some(update => update.last_error));
  assert.ok(updates.some(update => update.lock_id === null));
});
test('token encryption round trips without exposing plaintext; key required', async () => {
  let encryptionKey = 'fixture-encryption-key-at-least-32-characters';
  const runtime = load('../supabase/functions/x-tracking/runtime.ts', {
    '../_shared/posthog.ts': { adminClient: () => ({}) }, './domain.mjs': domain,
  }, { Deno: { env: { get: name => name === 'X_TOKEN_ENCRYPTION_KEY' ? encryptionKey : 'fixture' } } });
  const ciphertext = await runtime.encrypt('fixture-token');
  assert.notEqual(ciphertext, 'fixture-token');
  assert.equal(await runtime.decrypt(ciphertext), 'fixture-token');
  encryptionKey = '';
  await assert.rejects(runtime.encrypt('fixture-token'), /configured/);
});

test('successful collection saves both timelines and refreshes daily counts without tagging', async () => {
  const store = database([
    { data: [{ id: 'account' }] }, // lease
    { data: null }, { data: null }, // timeline cursors
    { data: [{ id: 'tracked', post_id: id }] }, // daily queue
    { data: null }, { data: null }, // completion and unlock
  ]);
  const paths = [];
  const { collect } = load('../supabase/functions/x-tracking/collector.ts', {
    './runtime.ts': { db: store.db, account: async () => ({ id: 'account', platform_user_id: '123' }), accessToken: async () => 'fixture' },
    './domain.mjs': { ...domain, xGet: async path => { paths.push(path); return { data: [post] }; } },
  });
  const result = await collect();
  assert.equal(result.collected, 2);
  assert.equal(result.refreshed, 1);
  assert.equal(paths.length, 3);
  assert.equal(store.records.length, 3);
  assert.equal(store.records[1].args.p_mention, true);
  assert.equal(store.records.some(r => 'project_tags' in r.args.p_post), false);
  assert.ok(store.calls.some(call => call.method === 'update' && call.args[0].last_synced_at));
});
test('unavailable own post keeps real metrics, gets no fabricated daily snapshot', async () => {
  const store = database([
    { data: [{ id: 'account' }] }, { data: null }, { data: null },
    { data: [{ id: 'tracked', post_id: id }] }, { data: null }, { data: null }, { data: null },
  ]);
  const { collect } = load('../supabase/functions/x-tracking/collector.ts', {
    './runtime.ts': { db: store.db, account: async () => ({ id: 'account', platform_user_id: '123' }), accessToken: async () => 'fixture' },
    './domain.mjs': { ...domain, xGet: async () => ({ data: [] }) },
  });
  assert.equal((await collect()).unavailable, 1);
  assert.equal(store.records.length, 0);
  const update = store.calls.find(call => call.table === 'x_tracked_posts' && call.method === 'update').args[0];
  assert.match(update.last_error, /unavailable/);
  assert.equal('metrics' in update, false);
  assert.equal('last_synced_at' in update, false);
});
test('OAuth initiation uses S256 and requests only read/offline permissions', async () => {
  const h = handlerHarness();
  const response = await h.request({ action: 'connect' });
  const url = new URL((await response.json()).url);
  assert.equal(url.origin, 'https://x.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'tweet.read users.read offline.access');
  assert.equal(h.calls.filter(call => call.method === 'insert').length, 1);
});
test('expired access tokens refresh once and persist encrypted replacement tokens', async () => {
  const store = database([{ data: null }]);
  let exchanges = 0;
  const runtime = load('../supabase/functions/x-tracking/runtime.ts', {
    '../_shared/posthog.ts': { adminClient: () => store.db }, './domain.mjs': domain,
  }, { Deno: { env: { get: name => name === 'X_TOKEN_ENCRYPTION_KEY' ? 'fixture-encryption-key-at-least-32-characters' : 'fixture' } },
    fetch: async (url, options) => {
      exchanges++;
      assert.equal(url, 'https://api.x.com/2/oauth2/token');
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      assert.equal(options.body.get('refresh_token'), 'old-refresh');
      return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 7200, scope: domain.SCOPES });
    } });
  const row = { id: 'account', platform_user_id: '123', token_expires_at: '2020-01-01',
    access_token_encrypted: await runtime.encrypt('old-access'), refresh_token_encrypted: await runtime.encrypt('old-refresh') };
  assert.equal(await runtime.accessToken(row), 'new-access');
  assert.equal(exchanges, 1);
  const update = store.calls.find(call => call.method === 'update').args[0];
  assert.equal(await runtime.decrypt(update.access_token_encrypted), 'new-access');
  assert.equal(await runtime.decrypt(update.refresh_token_encrypted), 'new-refresh');
});

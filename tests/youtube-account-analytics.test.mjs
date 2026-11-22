import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAnalyticsHandler, ANALYTICS_COLUMNS } from '../supabase/functions/youtube-analytics/runtime.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const secret = 'SERVICE_SECRET_SENTINEL', tokenSecret = 'OAUTH_SECRET_SENTINEL';
const VIDEO = 'abcdefghijk';
const input = { source_type: 'episode', publication_id: ID, start_date: '2026-11-01', end_date: '2026-11-20' };
function fixture(options = {}) {
  const calls = [], lookups = [];
  const publication = { id: ID, platform: 'youtube', status: 'live', youtube_account_id: ACCOUNT,
    external_id: VIDEO, external_url: 'https://untrusted.invalid/ignored', episode_id: 'episode-one', branch_slug: 'rekkrd', ...options.publication };
  const account = { id: ACCOUNT, platform: 'youtube', status: 'active', external_account_id: 'UC_expected', branch_slug: 'rekkrd', ...options.account };
  const handler = createAnalyticsHandler({
    serviceKey: options.serviceKey ?? secret, supabaseUrl: 'https://hub.invalid', now: () => Date.parse('2026-11-21T12:00:00Z'),
    loadPublication: async (source, id) => { lookups.push({ source, id }); if (options.dbError) throw new Error(tokenSecret); return options.missingPublication ? null : publication; },
    loadAccount: async id => { lookups.push({ account: id }); return account; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      init.signal.throwIfAborted();
      const n = calls.length;
      if (options.throwAt === n) throw new Error(tokenSecret);
      if (options.failAt === n) return new Response(JSON.stringify({ error: tokenSecret }), { status: 403 });
      if (n === 1) return Response.json(options.token ?? { access_token: tokenSecret, youtube_account_id: ACCOUNT, channel_id: account.external_account_id, refresh_token: 'never-copy' });
      if (n === 2) return Response.json(options.channels ?? { items: [{ id: account.external_account_id }] });
      if (n === 3) return Response.json(options.videos ?? { items: [{ id: VIDEO, snippet: { channelId: account.external_account_id }, statistics: { viewCount: '37', likeCount: '2', privateSecret: tokenSecret } }] });
      if (n === 4) return Response.json(options.analytics ?? { columnHeaders: ANALYTICS_COLUMNS.map(name => ({ name, dataType: name === 'day' ? 'STRING' : 'FLOAT' })), rows: [['2026-11-15', 10, 2.5, 15, 50, 1, 0, 3, 2, 1]], secret: tokenSecret });
      throw new Error('Unexpected request');
    },
  });
  async function run(body = input, { auth = `Bearer ${secret}`, method = 'POST', raw } = {}) {
    const req = new Request('https://hub.invalid/functions/v1/youtube-analytics', { method, headers: { authorization: auth }, ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}) });
    const res = await handler(req), text = await res.text();
    assert.ok(!text.includes(secret) && !text.includes(tokenSecret) && !text.includes('never-copy'), 'response never exposes credentials or provider extras');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    return { status: res.status, body: JSON.parse(text) };
  }
  return { run, calls, lookups };
}

test('service-only endpoint fails closed before database/provider work', async () => {
  for (const options of [{ auth: '' }, { auth: 'Bearer ordinary-user' }, { method: 'GET' }]) {
    const f = fixture();
    assert.equal((await f.run(input, options)).status, options.method ? 405 : 403);
    assert.deepEqual(f.lookups, []); assert.deepEqual(f.calls, []);
  }
  const f = fixture({ serviceKey: '' });
  assert.equal((await f.run(input, { auth: 'Bearer ' })).status, 403);
});

test('validates publication identity and real inclusive reporting dates with 200-day cap', async () => {
  for (const body of [null, { ...input, source_type: 'clip' }, { ...input, publication_id: 'url' }, { ...input, start_date: '2026-02-30' },
    { ...input, end_date: '2026-11-21' }, { ...input, end_date: '2026-10-01' }, { ...input, start_date: '2026-05-04' }]) {
    const f = fixture(); assert.equal((await f.run(body)).status, 400); assert.equal(f.lookups.length, 0);
  }
  const f = fixture(); assert.equal((await f.run(input, { raw: '{' })).status, 400);
  const boundary = fixture(); assert.equal((await boundary.run({ ...input, start_date: '2026-05-05' })).body.status, 'ok');
});

test('loads the explicit stored account; safe full response and fixed endpoints contain only bound identities', async () => {
  const f = fixture();
  const result = await f.run({ ...input, youtube_account_id: 'attacker', youtube_video_id: 'attacker', url: 'https://attacker.invalid' });
  assert.equal(result.body.status, 'ok');
  assert.deepEqual(result.body.statistics, { viewCount: '37', likeCount: '2' });
  assert.deepEqual(result.body.job, { source_type: 'episode', episode_id: 'episode-one', publication_id: ID, studio_album_id: null,
    studio_publication_id: null, youtube_video_id: VIDEO, external_url: `https://youtu.be/${VIDEO}`, start_date: input.start_date, end_date: input.end_date,
    youtube_account_id: ACCOUNT, channel_id: 'UC_expected' });
  assert.deepEqual(result.body.analytics.rows, [['2026-11-15', 10, 2.5, 15, 50, 1, 0, 3, 2, 1]]);
  assert.deepEqual(f.lookups, [{ source: 'episode', id: ID }, { account: ACCOUNT }]);
  assert.equal(f.calls.length, 4);
  for (const call of f.calls) assert.ok(call.init.signal instanceof AbortSignal, 'each outbound call has a bounded abort signal');
  assert.equal(f.calls[0].url, 'https://hub.invalid/functions/v1/youtube-publish-token');
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${secret}`);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { youtube_account_id: ACCOUNT });
  for (const call of f.calls.slice(1)) { assert.equal(call.init.headers.Authorization, `Bearer ${tokenSecret}`); assert.ok(!call.url.includes(tokenSecret)); }
  assert.equal(new URL(f.calls[3].url).searchParams.get('ids'), 'channel==UC_expected');
  assert.equal(new URL(f.calls[3].url).searchParams.get('filters'), `video==${VIDEO}`);
});

test('independent Studio channel uses album provenance and its own token identity', async () => {
  const f = fixture({ publication: { album_id: 'album-two', episode_id: undefined }, account: { external_account_id: 'UC_second' },
    token: { access_token: tokenSecret, youtube_account_id: ACCOUNT, channel_id: 'UC_second' } });
  const { body } = await f.run({ ...input, source_type: 'studio' });
  assert.equal(body.status, 'ok'); assert.equal(body.job.channel_id, 'UC_second');
  assert.equal(body.job.studio_album_id, 'album-two'); assert.equal(body.job.studio_publication_id, ID);
  assert.equal(body.job.publication_id, null); assert.equal(body.job.episode_id, null);
});

test('legacy missing mapping explicitly skips without default account or provider calls', async () => {
  const f = fixture({ publication: { youtube_account_id: null } });
  assert.deepEqual((await f.run()).body, { status: 'skipped', reason: 'missing_youtube_account', source_type: 'episode', publication_id: ID });
  assert.equal(f.calls.length, 0); assert.equal(f.lookups.length, 1);
});

test('inactive/non-YouTube publications and invalid account/branch are unavailable before token access', async () => {
  for (const options of [{ missingPublication: true }, { publication: { status: 'pending' } }, { publication: { platform: 'spotify' } },
    { account: { platform: 'tiktok' } }, { account: { status: 'revoked' } }, { account: { branch_slug: 'different' } }, { account: { id: 'different' } }]) {
    const f = fixture(options); assert.equal((await f.run()).body.status, 'unavailable'); assert.equal(f.calls.length, 0);
  }
});

test('always verifies cached token channel and video owner before querying reports', async () => {
  for (const [options, reason, count] of [
    [{ token: { access_token: tokenSecret, youtube_account_id: 'other', channel_id: 'UC_expected' } }, 'token_unavailable', 1],
    [{ channels: { items: [{ id: 'UC_wrong' }] } }, 'channel_mismatch', 2],
    [{ channels: { items: [] } }, 'channel_mismatch', 2],
    [{ videos: { items: [] } }, 'video_unavailable', 3],
    [{ videos: { items: [{ id: VIDEO, snippet: { channelId: 'UC_wrong' }, statistics: {} }] } }, 'video_channel_mismatch', 3],
  ]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.body.reason, reason); assert.equal(f.calls.length, count); assert.ok(!('analytics' in result.body));
  }
});

test('every provider failure or thrown exception retains existing metrics rather than returning zero rows as success', async () => {
  for (const field of ['failAt', 'throwAt']) for (let n = 1; n <= 4; n++) {
    const f = fixture({ [field]: n }), { body } = await f.run();
    assert.equal(body.status, 'unavailable'); assert.ok(!('analytics' in body)); assert.ok(!('statistics' in body)); assert.equal(f.calls.length, n);
  }
  const f = fixture({ dbError: true }); assert.equal((await f.run()).body.reason, 'publication_unavailable');
});

test('an outbound timeout is bounded at 15s and returns unavailable without exposing token/error text', async t => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', ms => {
    deadlines.push(ms);
    return AbortSignal.abort(new Error(tokenSecret));
  });
  const f = fixture(), { body } = await f.run();
  assert.equal(body.status, 'unavailable'); assert.equal(body.reason, 'token_unavailable');
  assert.deepEqual(deadlines, [15000]); assert.equal(f.calls.length, 1);
});

test('empty analytics is a valid delay/empty result and creates no fabricated daily rows', async () => {
  for (const extra of [{ rows: [] }, {}]) {
    const f = fixture({ analytics: { columnHeaders: ANALYTICS_COLUMNS.map(name => ({ name })), ...extra } });
    const { body } = await f.run(); assert.equal(body.status, 'ok'); assert.deepEqual(body.analytics.rows, []);
  }
});

test('rejects reordered/unknown columns, malformed dates/numbers and duplicate/out-of-window report rows', async () => {
  const headers = ANALYTICS_COLUMNS.map(name => ({ name })), good = ['2026-11-15', 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const analytics of [{ columnHeaders: [...headers].reverse(), rows: [good] }, { columnHeaders: headers.slice(1), rows: [] },
    { columnHeaders: headers, rows: [['2026-11-15', '1', 2, 3, 4, 5, 6, 7, 8, 9]] },
    { columnHeaders: headers, rows: [['2026-11-15', -1, 2, 3, 4, 5, 6, 7, 8, 9]] },
    { columnHeaders: headers, rows: [['2026-02-30', 1, 2, 3, 4, 5, 6, 7, 8, 9]] },
    { columnHeaders: headers, rows: [['2026-10-01', 1, 2, 3, 4, 5, 6, 7, 8, 9]] },
    { columnHeaders: headers, rows: [good, good] }, { columnHeaders: headers, rows: 'bad' }]) {
    const f = fixture({ analytics }), { body } = await f.run(); assert.equal(body.status, 'unavailable'); assert.equal(body.reason, 'analytics_unavailable');
  }
});

test('only approved YouTube URL fallbacks resolve videos; hidden counts stay absent', async () => {
  const good = fixture({ publication: { external_id: null, external_url: `https://youtu.be/${VIDEO}` } });
  assert.equal((await good.run()).body.status, 'ok');
  for (const url of [`https://evil.invalid/${VIDEO}`, `https://www.youtube.com.evil.invalid/watch?v=${VIDEO}`, `javascript:${VIDEO}`]) {
    const f = fixture({ publication: { external_id: null, external_url: url } });
    assert.equal((await f.run()).body.reason, 'invalid_video_id'); assert.equal(f.calls.length, 0);
  }
  const f = fixture({ videos: { items: [{ id: VIDEO, snippet: { channelId: 'UC_expected' }, statistics: {} }] } });
  assert.deepEqual((await f.run()).body.statistics, {});
});

test('production adapter reloads source-specific tables and branch association without secret reads or logs', async () => {
  const adapter = await readFile(new URL('../supabase/functions/youtube-analytics/index.ts', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../supabase/functions/youtube-analytics/runtime.mjs', import.meta.url), 'utf8');
  assert.match(adapter, /studio_publications.*trellis_episode_publications/);
  assert.match(adapter, /one\('trellis_episodes', 'branch', row\.episode_id\)/);
  assert.match(adapter, /one\('branches', 'slug', account\.branch_id\)/);
  assert.doesNotMatch(adapter + runtime, /console\.|social_credentials|get_social_account_credential|refresh_token/);
});

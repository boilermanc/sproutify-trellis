import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebhook, fetchDashboardEmailEvents, fetchEmailHealth, healthRows, probeWebhook, retryRead } from '../supabase/functions/_shared/system-health.mjs';

test('GET distinguishes a registered POST webhook from a missing path', () => {
  assert.equal(classifyWebhook(404, '{"message":"This webhook is not registered for GET requests. Did you mean to make a POST request?"}').status, 'ok');
  assert.equal(classifyWebhook(404, 'The requested webhook "GET example" is not registered.').status, 'down');
  assert.equal(classifyWebhook(404, '<html>Not found</html>').status, 'error');
  for (const code of [401, 403, 429, 500, 502, 503]) assert.equal(classifyWebhook(code).status, 'error');
});

test('probe uses GET only, labels execution health untested, includes checked time', async () => {
  const observed = [];
  const result = await probeWebhook({ path: 'test', label: 'Test', critical: true }, async (url, init) => {
    observed.push(init);
    return new Response('This webhook is not registered for GET requests. Did you mean to make a POST request?', { status: 404 });
  });
  assert.equal(result.status, 'ok');
  assert.equal(observed[0].method, 'GET');
  assert.equal(observed[0].body, undefined);
  assert.match(result.detail, /Execution health is not tested/);
  assert.ok(Date.parse(result.checked_at));
});

test('only transient failures retry, with a strict two-attempt bound', async () => {
  let calls = 0;
  const recovered = await retryRead(async () => new Response('', { status: ++calls === 1 ? 503 : 200 }), async () => {});
  assert.equal(recovered.attempts, 2);
  calls = 0;
  await retryRead(async () => { calls++; return new Response('', { status: 401 }); }, async () => {});
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new Error('offline'); }, async () => {}));
  assert.equal(calls, 2);
});

test('email health uses exact database counts without retrieving capped events', async () => {
  const counts = { sent: 4343, bounced: 6, complained: 3 };
  const selections = [];
  const db = { from: table => {
    assert.equal(table, 'email_events');
    let type;
    const q = { select: (columns, options) => { selections.push(options); return q; }, eq: (field, value) => { type = value; return q; }, gte: () => q, lt: () => Promise.resolve({ count: counts[type], error: null }) };
    return q;
  } };
  const report = await fetchEmailHealth(db, '2026-09-12T18:00:00Z');
  assert.equal(report.sent, 4343);
  assert.equal(report.complained, 3);
  assert.equal(report.since, '2026-09-05T18:00:00.000Z');
  assert.ok(selections.every(s => s.count === 'exact' && s.head === true));
});

test('unknown data is never shown as healthy; complaints are review, optional missing paths are optional', () => {
  const rows = healthRows({ webhooks: [{ path: 'unused', label: 'Unused', critical: false, status: 'down', detail: 'Missing' }], spokes: [], email: { sent: 4343, bounced: 6, complained: 3, until: '2026-09-12' } });
  assert.equal(rows.find(r => r.key === 'resend:dispatch').status, 'warning');
  assert.equal(rows.find(r => r.key === 'webhook:unused').status, 'optional');
  assert.equal(healthRows({ webhooks: [], spokes: [], email: null })[0].status, 'unknown');
  assert.equal(healthRows({ webhooks: [], spokes: [], email: { sent: 0, bounced: 2, complained: 0 } })[0].status, 'warning');
});

test('event pagination reads past a smaller server cap and fails instead of returning partial data', async () => {
  const expected = Array.from({ length: 2105 }, (_, id) => ({ id }));
  let broken = false;
  const db = { from: () => {
    const q = { select: () => q, gte: () => q, lt: () => q, order: () => q,
      range: start => Promise.resolve(broken && start > 0 ? { error: new Error('page failed') } : { data: expected.slice(start, start + 500) }) };
    return q;
  } };
  assert.deepEqual(await fetchDashboardEmailEvents(db, 'since', 'until'), expected);
  broken = true;
  await assert.rejects(fetchDashboardEmailEvents(db, 'since', 'until'), /page failed/);
});

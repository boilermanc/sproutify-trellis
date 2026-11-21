import test from 'node:test';
import assert from 'node:assert/strict';
import { issueBody, marker, reconcileIssues, safeText, validateReport } from '../scripts/daily-health.mjs';

const row = { key: 'webhook:test', name: 'Test publisher', status: 'down', code: 'MISSING', detail: 'Path missing' };
const report = (systems = [row], complete = true) => ({ version: 1, checked_at: new Date().toISOString(), complete, systems, webhooks: [] });
const issue = (state = 'open', login = 'github-actions[bot]') => ({ number: 42, state, user: { login }, body: issueBody(row, report(), 'https://example.com') });
async function run(data, issues = []) {
  const calls = [];
  await reconcileIssues({ report: data, issues, api: async (...args) => { calls.push(args); }, runUrl: 'https://example.com' });
  return calls;
}

test('create once, remain quiet while unchanged, reopen after recurrence', async () => {
  assert.equal((await run(report()))[0][0], 'POST');
  assert.equal((await run(report(), [issue()])).length, 0);
  const reopened = await run(report(), [issue('closed')]);
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0][2].state, 'open');
});

test('only complete, explicitly healthy checks close issues', async () => {
  assert.equal((await run(report([], false), [issue()])).length, 0);
  assert.equal((await run(report([]), [issue()])).length, 0);
  const healthy = report([{ ...row, status: 'ok' }]);
  const closed = await run(healthy, [issue()]);
  assert.equal(closed.length, 2);
  assert.equal(closed[1][2].state, 'closed');
  assert.equal((await run(healthy, [issue('open', 'clint')])).length, 0);
});

test('optional rows create no issues; unavailable monitoring remains actionable', async () => {
  assert.equal((await run(report([{ ...row, status: 'optional' }]))).length, 0);
  assert.equal((await run(report([{ ...row, status: 'unknown' }], false))).length, 1);
});

test('recovery of one check cannot close another, including a removed configuration', async () => {
  const data = report([]);
  data.webhooks = [{ path: 'other', status: 'ok' }];
  assert.equal((await run(data, [issue()])).length, 0);
  data.webhooks = [{ path: 'test', status: 'ok' }];
  assert.equal((await run(data, [issue()])).length, 2);
});

test('reject stale and malformed responses and scrub diagnostic secrets and mentions', () => {
  assert.throws(() => validateReport({}));
  assert.throws(() => validateReport({ ...report(), checked_at: '2020-01-01T00:00:00Z' }));
  assert.throws(() => validateReport(report([{ ...row, key: 'bad\nmarker' }])));
  assert.equal(validateReport(report()).version, 1);
  assert.doesNotMatch(safeText('email@example.com @everyone `text` https://private.test/' + 'a'.repeat(70)), /email@|@everyone|private\.test|a{40}/);
  assert.ok(issue().body.includes(marker(row.key)));
});

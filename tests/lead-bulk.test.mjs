import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let runSequentialBulk;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ runSequentialBulk } = await server.ssrLoadModule('/components/leads/leadBulk.ts'));
});

after(async () => { await server?.close(); });

test('continues after a row failure and reports progress', async () => {
  const progress = [];
  const result = await runSequentialBulk([1, 2, 3], async value => {
    if (value === 2) throw new Error('blocked');
    return value * 10;
  }, (completed, total) => progress.push([completed, total]));
  assert.deepEqual(result.successes.map(item => item.result), [10, 30]);
  assert.equal(result.failures[0].reason, 'blocked');
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
});

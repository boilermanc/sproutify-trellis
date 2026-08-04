import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let calculateLeadMetrics;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ calculateLeadMetrics } = await server.ssrLoadModule('/components/leads/LeadMetrics.tsx'));
});

after(async () => { await server?.close(); });

test('uses filtered leads except for all-time win rate', () => {
  const all = [
    { status: 'open', stage: 'proposal', estimated_value: 1000, created_at: '2026-08-01' },
    { status: 'won', stage: 'won', estimated_value: 2000, created_at: '2026-07-01' },
    { status: 'lost', stage: 'lost', estimated_value: 3000, created_at: '2026-06-01' },
  ];
  const result = calculateLeadMetrics([all[0]], all, ['proposal', 'won', 'lost'], Date.parse('2026-08-04T12:00:00Z'));
  assert.equal(result.openCount, 1);
  assert.equal(result.openValue, 1000);
  assert.equal(result.winRate, 50);
  assert.equal(result.addedLast30Days, 1);
  assert.equal(result.stageCounts.proposal, 1);
});

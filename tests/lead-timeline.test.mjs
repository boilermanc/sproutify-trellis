import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let formatRelativeTime;
let summarizeTimelineEntry;

before(async () => {
  server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  ({ formatRelativeTime, summarizeTimelineEntry } = await server.ssrLoadModule('/components/leads/LeadTimeline.tsx'));
});

after(async () => {
  await server?.close();
});

test('formats relative timestamps without a date dependency', () => {
  const now = Date.parse('2026-08-04T12:00:00.000Z');
  assert.equal(formatRelativeTime('2026-08-04T11:55:00.000Z', now), '5m ago');
  assert.equal(formatRelativeTime('2026-08-02T12:00:00.000Z', now), '2d ago');
});

test('summarizes stage changes and call outcomes', () => {
  assert.equal(summarizeTimelineEntry({ event_type: 'lead_stage_change', payload: { from: 'new', to: 'contacted' } }), 'Stage: new → contacted');
  assert.equal(summarizeTimelineEntry({ event_type: 'lead_call', payload: { outcome: 'no_answer', summary: 'Try Friday' } }), 'Call: no answer · Try Friday');
});

test('shows quote amount prominently', () => {
  const summary = summarizeTimelineEntry({ event_type: 'lead_quote', payload: { amount: 25000, description: 'Ten towers' } });
  assert.match(summary, /Quote \$25,000\.00/);
  assert.match(summary, /Ten towers/);
});

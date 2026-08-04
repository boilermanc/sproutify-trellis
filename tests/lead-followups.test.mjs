import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let followUpState;
let getFollowUpWindow;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ followUpState, getFollowUpWindow } = await server.ssrLoadModule('/components/leads/leadViewUtils.ts'));
});

after(async () => { await server?.close(); });

test('uses local end-of-day and a seven-day forward window', () => {
  const window = getFollowUpWindow(new Date(2026, 7, 4, 9, 30));
  assert.equal(new Date(window.endOfToday).getHours(), 23);
  assert.equal(new Date(window.endOfNextSevenDays).getDate(), 11);
});

test('classifies overdue and upcoming open follow-ups', () => {
  const window = { endOfToday: Date.parse('2026-08-04T23:59:59Z'), endOfNextSevenDays: Date.parse('2026-08-11T23:59:59Z') };
  assert.equal(followUpState({ status: 'open', next_action_at: '2026-08-03T12:00:00Z' }, window), 'overdue');
  assert.equal(followUpState({ status: 'open', next_action_at: '2026-08-08T12:00:00Z' }, window), 'upcoming');
  assert.equal(followUpState({ status: 'won', next_action_at: '2026-08-03T12:00:00Z' }, window), null);
});

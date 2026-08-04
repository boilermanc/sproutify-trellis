import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let followUpState;
let getFollowUpWindow;
let leadMatchesSearch;
let paginateItems;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ followUpState, getFollowUpWindow, leadMatchesSearch, paginateItems } = await server.ssrLoadModule('/components/leads/leadViewUtils.ts'));
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

test('searches lead identity and CRM context with multiple terms', () => {
  const lead = {
    profile: { first_name: 'Jason', last_name: 'Parkinson', email: 'jason@example.com', phone: '555-0100' },
    source: 'tower_farm_form',
    stage: 'qualified',
    status: 'open',
    inquiry_text: 'Interested in ten towers',
    notes: 'Farm Name: Marinela Holistic Edu',
    assigned_to: 'Clint',
  };
  assert.equal(leadMatchesSearch(lead, 'jason marinela'), true);
  assert.equal(leadMatchesSearch(lead, '555-0100 qualified'), true);
  assert.equal(leadMatchesSearch(lead, 'unrelated'), false);
});

test('paginates and clamps an out-of-range page', () => {
  const result = paginateItems(Array.from({ length: 24 }, (_, index) => index + 1), 9, 10);
  assert.equal(result.page, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startItem, 21);
  assert.equal(result.endItem, 24);
  assert.deepEqual(result.items, [21, 22, 23, 24]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { answerPosthogQuestion } from '../services/sagePosthogReporting.mjs';

const branches = [
  { id: 'rek', name: 'Rekkrd', slug: 'rekkrd', website_url: 'rekkrd.com' },
  { id: 'rej', name: 'Rejoice', slug: 'rejoice', website_url: 'letsrejoice.app' },
  { id: 'farm', name: 'Sproutify Farm', slug: 'farm', website_url: 'farm.sproutify.app' },
];
const connection = (branch, project_id) => ({
  id: `connection-${branch.id}`, branch_id: branch.id, branch_name: branch.name,
  branch_slug: branch.slug, project_id, status: 'active',
  allowed_events: ['discogs_connected', 'meaningful_return'],
  api_key_preview: 'DO-NOT-DISPLAY-KEY', last_error: 'DO-NOT-DISPLAY-ERROR',
});
const connections = [connection(branches[0], '605974'), connection(branches[1], '252036')];
const report = (connection, days = 30) => ({
  connection_id: connection.id, branch_id: connection.branch_id,
  fetched_at: new Date().toISOString(), cached: true, stale: false,
  data: {
    window_days: days, active_users: { daily: 6, weekly: 7, monthly: 68 },
    users: { total_in_window: 68, new: 30, returning: 38 }, sessions: 79,
    lifecycle_funnel: {
      labels: connection.branch_id === 'rej' ? { signed_up: 'Installed', onboarded: 'Identified', activated: 'Activated' } : undefined,
      signed_up: 30, onboarded: 14, activated: 1,
      signup_to_onboarding_pct: 46.7, onboarding_to_activation_pct: 7.1,
    },
    retention: { cohort_7: 24, retained_7: 2, cohort_30: 107, retained_30: 5, day_7_pct: 999, day_30_pct: 999 },
    feature_adoption: [{ event: 'discogs_connected', users: 3, events: 5 }],
  },
});

function harness({ list = connections, fetch = report, options = {} } = {}) {
  const calls = [];
  let lists = 0;
  const readers = {
    listConnections: async () => { lists++; return typeof list === 'function' ? list() : list; },
    fetchAnalytics: async (id, days) => {
      calls.push({ id, days });
      return fetch(list.find((item) => item.id === id), days);
    },
  };
  return {
    ask: (question, previous) => answerPosthogQuestion(question, { allBranches: branches, isAllSelected: false, activeBranchSlugs: ['rekkrd'], ...options, previous }, readers),
    calls, get lists() { return lists; },
  };
}

test('all properties bypasses the view filter and discovers future connections', async () => {
  const future = connection({ id: 'future', name: 'Future App', slug: 'future' }, '12345');
  const h = harness({ list: [...connections, future] });
  const answer = await h.ask('How are all PostHog properties doing?');
  assert.deepEqual(h.calls.map((call) => call.id), [...connections, future].map((item) => item.id));
  assert.match(answer.text, /Future App · project 12345/);
  assert.match(answer.text, /not deduplicated across properties/);
  assert.equal(answer.context.all, true);
  assert.doesNotMatch(answer.text, /DO-NOT-DISPLAY/);
});

test('the view filter applies by default; explicit branch names and IDs override it', async () => {
  for (const [question, expected] of [
    ['How many active users do we have?', 'connection-rek'],
    ['Show Rejoice product events', 'connection-rej'],
    ['Show PostHog project 252036 usage', 'connection-rej'],
    ['How is rekkerd doing?', 'connection-rek'],
    ['Show letsrejoice.app usage', 'connection-rej'],
  ]) {
    const h = harness();
    const answer = await h.ask(question);
    assert.deepEqual(h.calls.map((call) => call.id), [expected], question);
    assert.ok(answer.text.includes('PostHog'));
  }
});

test('explicit multi-branch comparison reads both without combining people', async () => {
  const h = harness();
  const answer = await h.ask('Compare Rekkrd and Rejoice retention');
  assert.equal(h.calls.length, 2);
  assert.match(answer.text, /2 of 24 users \(8\.3%\)/);
  assert.match(answer.text, /5 of 107 users \(4\.7%\)/);
  assert.doesNotMatch(answer.text, /999|38 returning/);
});

test('follow-ups preserve the chosen scope, window and topic; a named branch changes scope', async () => {
  const h = harness();
  const first = await h.ask('Rekkrd usage over 90 days');
  const second = await h.ask('What about Rejoice?', first.context);
  const third = await h.ask('And 7 days?', second.context);
  const fourth = await h.ask('Are they coming back?', third.context);
  assert.deepEqual(h.calls, [
    { id: 'connection-rek', days: 90 }, { id: 'connection-rej', days: 90 },
    { id: 'connection-rej', days: 7 }, { id: 'connection-rej', days: 7 },
  ]);
  assert.equal(fourth.context.topic, 'retention');
  assert.doesNotMatch(fourth.text, /Active users:/);
});

test('empty selection, unconnected branches and disconnected projects never expand to all', async () => {
  const empty = harness({ options: { activeBranchSlugs: [] } });
  assert.match((await empty.ask('Show product analytics')).text, /No PostHog property is selected/);
  assert.equal(empty.calls.length, 0);
  const h = harness({ list: [connections[0], { ...connections[1], status: 'disconnected' }] });
  assert.match((await h.ask('Rejoice usage')).text, /no connected PostHog property/);
  assert.match((await h.ask('Show Farm PostHog analytics')).text, /Sproutify Farm: no connected/);
  assert.equal(h.calls.length, 0);
  const none = harness({ list: [], options: { isAllSelected: true } });
  assert.match((await none.ask('Show PostHog usage')).text, /No PostHog properties are connected/);
});

test('metric follow-ups keep conversational scope and an unsupported period can be corrected', async () => {
  const h = harness();
  const first = await h.ask('Rejoice usage over 14 days');
  const second = await h.ask('7 days', first.context);
  const third = await h.ask('How many sessions?', second.context);
  assert.deepEqual(h.calls, [{ id: 'connection-rej', days: 7 }, { id: 'connection-rej', days: 7 }]);
  assert.equal(third.context.windowDays, 7);
  assert.match((await h.ask('What about Ghost?', third.context)).text, /couldn’t match/);
  assert.equal(h.calls.length, 2);
});

test('new-user and first-record questions use lifecycle evidence with accurate definitions', async () => {
  const h = harness();
  const first = await h.ask('How many new users do we have?');
  assert.match(first.text, /based on signup\/install events/);
  assert.doesNotMatch(first.text, /30 first.time/);
  const second = await h.ask('How many people added their first record in Rekkrd?');
  assert.match(second.text, /Activated 1/);
  assert.doesNotMatch(second.text, /Feature milestones/);
});

test('unknown project requests cannot silently use the current branch', async () => {
  const h = harness();
  assert.match((await h.ask('Show PostHog project 999 usage')).text, /couldn’t match/);
  assert.match((await h.ask('PostHog property Ghost retention')).text, /couldn’t match/);
  assert.equal(h.calls.length, 0);
});

test('supports only exact rolling 7, 30 or 90 day windows', async () => {
  for (const [phrase, days] of [['past 7 days', 7], ['last 30 days', 30], ['90 days', 90], ['this week', 7], ['past month', 30]]) {
    const h = harness();
    assert.match((await h.ask(`PostHog usage ${phrase}`)).text, new RegExp(`rolling last ${days} days`));
    assert.equal(h.calls[0].days, days);
  }
  for (const phrase of ['14 days', 'last week', 'last month', 'yesterday', 'since September 1', '2026-08-01 to 2026-08-30', '7 days versus 30 days']) {
    const h = harness();
    assert.match((await h.ask(`PostHog usage ${phrase}`)).text, /currently supports one rolling window/);
    assert.equal(h.calls.length, 0, phrase);
  }
});

test('successful branches remain available when another report fails, with no error-secret leakage', async () => {
  const h = harness({ fetch: (connection, days) => {
    if (connection.branch_id === 'rej') throw new Error('SECRET FROM TRANSPORT');
    return report(connection, days);
  } });
  const answer = await h.ask('Show all connected PostHog properties usage');
  assert.match(answer.text, /Rekkrd · project 605974\nActive users:/);
  assert.match(answer.text, /Rejoice · project 252036: report unavailable/);
  assert.doesNotMatch(answer.text, /SECRET FROM TRANSPORT/);
});

test('stale cache, old snapshots and missing timestamps are explicitly marked', async () => {
  for (const overrides of [
    { stale: true, warning: 'RAW-PRIVATE-ERROR' },
    { fetched_at: '2020-01-01T00:00:00Z' },
    { fetched_at: undefined },
  ]) {
    const h = harness({ fetch: (connection, days) => ({ ...report(connection, days), ...overrides }) });
    const answer = await h.ask('Rekkrd usage');
    assert.match(answer.text, /STALE snapshot/);
    assert.match(answer.text, /79 tracked sessions/);
    assert.doesNotMatch(answer.text, /RAW-PRIVATE-ERROR/);
  }
});

test('empty retention cohorts mean insufficient history, while observed zero retention is measurable', async () => {
  const h = harness({ fetch: (connection, days) => {
    const result = report(connection, days);
    result.data.retention = { cohort_7: 0, retained_7: 0, cohort_30: 10, retained_30: 0 };
    return result;
  } });
  const answer = await h.ask('Are people returning to Rekkrd?');
  assert.match(answer.text, /7-day repeat activity: insufficient prior-period history/);
  assert.match(answer.text, /30-day repeat activity: 0 of 10 users \(0\.0%\)/);
  assert.match(answer.text, /not exact day-7\/day-30 retention/);
});

test('lifecycle labels are respected and ratios are never presented as conversion funnels', async () => {
  const h = harness();
  const answer = await h.ask('Rejoice signup conversion funnel');
  assert.match(answer.text, /Installed 30; Identified 14; Activated 1/);
  assert.match(answer.text, /independent event counts, not a sequenced conversion funnel/);
  assert.doesNotMatch(answer.text, /46\.7|7\.1%/);
  assert.match((await h.ask('Rekkrd onboarding')).text, /does not yet emit/);
});

test('missing numeric fields are unavailable and feature output only uses approved events', async () => {
  const h = harness({ fetch: (connection, days) => {
    const result = report(connection, days);
    result.data.active_users.daily = undefined;
    result.data.sessions = null;
    result.data.feature_adoption.push({ event: 'private-email@example.com', users: 8, events: 10 });
    return result;
  } });
  const answer = await h.ask('Show Rekkrd PostHog summary');
  assert.match(answer.text, /unavailable in 24 hours/);
  assert.match(answer.text, /unavailable tracked sessions/);
  assert.match(answer.text, /discogs_connected: 3 users, 5 events/);
  assert.doesNotMatch(answer.text, /private-email/);
});

test('unsupported breakdowns and attribution return clear limits without querying unrelated metrics', async () => {
  for (const phrase of ['break down by platform', 'revenue attribution', 'raw events', 'which individual users', 'user properties', 'growth trend']) {
    const h = harness();
    assert.match((await h.ask(`PostHog ${phrase} for Rekkrd`)).text, /does not contain the requested/);
    assert.equal(h.calls.length, 0);
  }
});

test('connection discovery failure and mismatched report identity fail visibly', async () => {
  const failed = harness({ list: () => { throw new Error('PRIVATE'); } });
  assert.match((await failed.ask('PostHog usage')).text, /couldn’t read the PostHog connection list/);
  const mismatch = harness({ fetch: (connection, days) => ({ ...report(connection, days), branch_id: 'wrong-branch' }) });
  assert.match((await mismatch.ask('Rekkrd usage')).text, /report unavailable/);
  assert.doesNotMatch((await mismatch.ask('Rekkrd usage')).text, /79 tracked sessions/);
});

test('capability answers discover connections without reading analytics or exposing credentials', async () => {
  const h = harness();
  const answer = await h.ask('What live data can you access?');
  assert.match(answer.text, /Rekkrd \(project 605974\), Rejoice \(project 252036\)/);
  assert.match(answer.text, /email opens and ATL event registrations/);
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(answer.text, /DO-NOT-DISPLAY/);
});

test('existing email, registration and creative workflows remain untouched even after a PostHog answer', async () => {
  const h = harness();
  const previous = { all: true, branchIds: ['rek', 'rej'], windowDays: 30, topic: 'summary' };
  for (const question of [
    'How many people opened the last two ATL Urban Farms emails?',
    'How many people registered for ATL events?',
    'And which workshop attendees bought plants?',
    'Write an email about Rekkrd features',
    'Where can I review campaign performance?',
  ]) assert.equal(await h.ask(question, previous), null, question);
  assert.equal(h.lists, 0);
});

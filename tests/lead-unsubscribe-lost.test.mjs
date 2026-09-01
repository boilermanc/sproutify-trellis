import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('lead detail shows the activity timeline before the company deep dive', async () => {
  const leadsPage = await read('pages/Leads.tsx');
  const timelinePosition = leadsPage.indexOf('<LeadTimeline');
  const deepDivePosition = leadsPage.indexOf('<LeadDeepDive');

  assert.notEqual(timelinePosition, -1);
  assert.notEqual(deepDivePosition, -1);
  assert.ok(timelinePosition < deepDivePosition);
});

test('voluntary unsubscribes move only matching open leads to Lost', async () => {
  const migration = await read('supabase/migrations/20260901123344_mark_unsubscribed_open_leads_lost.sql');

  assert.match(migration, /new\.reason = 'unsubscribe'/);
  assert.match(migration, /new\.scope = 'global' or lower\(branch\.slug\) = lower\(new\.scope\)/);
  assert.match(migration, /lead\.status = 'open'/);
  assert.match(migration, /set status = 'lost',[\s\S]*stage = 'lost',[\s\S]*next_action_at = null/);
  assert.match(migration, /source, profile_id, payload\)[\s\S]*'unsubscribe'/);
});

test('Lost remains a dedicated Leads view while Open stays the default', async () => {
  const leadsPage = await read('pages/Leads.tsx');

  assert.match(leadsPage, /useState<LeadStatusFilter>\('open'\)/);
  assert.match(leadsPage, /\{ value: 'open', label: 'Active Leads' \}/);
  assert.match(leadsPage, /\{ value: 'lost', label: 'Lost' \}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectWeeklyActions } from '../services/weeklyActionsRules.mjs';

const candidate = (key, effortMinutes = 30, sourceUpdatedAt = '2026-09-20T12:00:00.000Z') => ({ key, effortMinutes, sourceUpdatedAt });

test('ranking order is preserved while enforcing the three-action cap and effort budget', () => {
  const ranked = [candidate('blocking', 50), candidate('prepared', 35), candidate('waiting', 30), candidate('extra', 5)];
  assert.deepEqual(selectWeeklyActions(ranked, {}, 120).map(item => item.key), ['blocking', 'prepared', 'waiting']);
  assert.deepEqual(selectWeeklyActions(ranked, {}, 70).map(item => item.key), ['blocking', 'extra']);
});

test('completion and dismissal stay hidden until the underlying source changes', () => {
  const states = {
    stable: { status: 'completed', sourceUpdatedAt: '2026-09-20T12:00:00.000Z' },
    changed: { status: 'dismissed', sourceUpdatedAt: '2026-09-19T12:00:00.000Z' },
  };
  const selected = selectWeeklyActions([candidate('stable'), candidate('changed')], states, 120);
  assert.deepEqual(selected.map(item => item.key), ['changed']);
});

test('future deferrals stay hidden and return for eligibility after their date', () => {
  const action = candidate('deferred');
  const states = { deferred: { status: 'deferred', sourceUpdatedAt: action.sourceUpdatedAt, deferredUntil: '2026-09-22T09:00:00.000Z' } };
  assert.equal(selectWeeklyActions([action], states, 120, new Date('2026-09-21T09:00:00.000Z')).length, 0);
  assert.equal(selectWeeklyActions([action], states, 120, new Date('2026-09-23T09:00:00.000Z')).length, 1);
});

test('implementation preserves branch permission, scope, stable identity and non-execution boundaries', () => {
  const service = readFileSync(new URL('../services/weeklyActionsService.ts', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../pages/Dashboard.tsx', import.meta.url), 'utf8');
  const overview = readFileSync(new URL('../components/dashboard/BusinessOverview.tsx', import.meta.url), 'utf8');
  const controlRoom = readFileSync(new URL('../components/dashboard/ControlRoom.tsx', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20260920152407_add_dashboard_action_states.sql', import.meta.url), 'utf8');
  assert.match(service, /canOwnBranch/);
  assert.match(service, /activeBranchSlugs/);
  assert.match(service, /campaign-draft:\$\{campaign\.id\}/);
  assert.match(service, /queue:\$\{item\.key\}/);
  assert.doesNotMatch(service, /sendCampaign|publishCampaign|launchCampaignDraft/);
  assert.match(dashboard, /onOpenCampaignDraft/);
  assert.match(dashboard, /businessOverview: businessOverviewResult/);
  assert.match(overview, /weeklyActions/);
  assert.doesNotMatch(overview, /verify-payment-source|connect-trial-lifecycle|rankBusinessActions/);
  assert.doesNotMatch(controlRoom, /weeklyActions/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /CHECK \(status IN \('active', 'completed', 'dismissed', 'deferred'\)\)/);
});

test('unsupported trial and conversion signals do not create recommendations', () => {
  const service = readFileSync(new URL('../services/weeklyActionsService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(service, /trial_ending|conversion_change|registration_change/);
  assert.match(service, /business-registration-review/);
  assert.match(service, /detail\.state === 'available'/);
});

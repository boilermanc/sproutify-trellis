import test from 'node:test';
import assert from 'node:assert/strict';
import { attachProfileSubscriptions, currentSubscription, subscriptionState, compareProfileSubscriptions, formatProfileDate, subscriptionEnd, subscriptionEndLabel } from '../services/profileSubscriptions.mjs';
import { countCollectionRecords, isRekkrdConnection } from '../supabase/functions/_shared/rekkrd-profile-metrics.mjs';

const now = Date.parse('2026-11-11T12:00:00Z');
const active = { id: 'one', _spoke_id: 'rekkrd', customer_id: 'a', plan: 'Collector', status: 'active', expires_at: '2026-12-01', created_at: '2026-10-01' };

test('subscription matching stays within a spoke and supports normalized email fallback', () => {
  const profiles = [{ id: 'a', email: 'a@example.test', _spoke_id: 'rekkrd' }, { id: 'a', email: 'a@example.test', _spoke_id: 'other' }, { email: ' B@EXAMPLE.TEST ', _spoke_id: 'rekkrd' }];
  const result = attachProfileSubscriptions(profiles, [active, { ...active, id: 'two', customer_id: null, email: 'b@example.test' }]);
  assert.deepEqual(result.map(p => p.subscription_records.length), [1, 0, 1]);
  assert.equal(profiles[0].subscription_records, undefined);
});

test('activity distinguishes expired, future, trial, canceled, missing and uncertain states', () => {
  assert.equal(subscriptionState(active, now), 'active');
  assert.equal(subscriptionState({ ...active, expires_at: new Date(now).toISOString() }, now), 'inactive');
  assert.equal(subscriptionState({ ...active, expires_at: '2026-01-01' }, now), 'inactive');
  assert.equal(subscriptionState({ ...active, status: 'trialing' }, now), 'active');
  assert.equal(subscriptionState({ ...active, status: 'canceled' }, now), 'inactive');
  assert.equal(subscriptionState({ ...active, status: 'past_due' }, now), 'unknown');
  assert.equal(subscriptionState({ ...active, started_at: '2027-01-01' }, now), 'unknown');
  assert.equal(subscriptionState(undefined, now), 'unknown');
  assert.equal(formatProfileDate('null'), 'Unknown');
  assert.equal(subscriptionState({ ...active, expires_at: 'invalid' }, now), 'unknown');
  assert.equal(formatProfileDate('2026-12-01'), new Date(2026, 11, 1).toLocaleDateString());
});

test('current membership prefers active records and keeps history immutable', () => {
  const records = [{ ...active, id: 'old', status: 'canceled', created_at: '2026-11-01' }, active];
  assert.equal(currentSubscription(records, now).id, 'one');
  assert.equal(records[0].id, 'old');
});

test('date, plan and activity sorts keep missing values last', () => {
  const a = { created_at: '2026-10-01', subscription_records: [active] };
  const b = { created_at: '2026-11-01', subscription_records: [{ ...active, plan: 'Studio', expires_at: '2026-12-20', status: 'expired' }] };
  assert.ok(compareProfileSubscriptions(a, b, 'signup-newest', now) > 0);
  assert.ok(compareProfileSubscriptions(a, b, 'signup-oldest', now) < 0);
  for (const sort of ['plan', 'active', 'ending']) assert.ok(compareProfileSubscriptions(a, b, sort, now) < 0);
  for (const sort of ['signup-newest', 'signup-oldest', 'ending', 'active', 'plan']) assert.ok(compareProfileSubscriptions({}, a, sort, now) > 0);
});

test('Rekkrd trials expire at trial_end even when the source status has not updated', () => {
  const trial = { ...active, status: 'trialing', trial_end: '2026-11-10', expires_at: null };
  assert.equal(subscriptionEnd(trial), '2026-11-10');
  assert.equal(subscriptionState(trial, now), 'inactive');
  assert.equal(subscriptionEndLabel(trial, now), 'Trial ended');
  assert.equal(subscriptionState({ ...trial, trial_end: '2026-11-17' }, now), 'active');
});

test('App Store dates/status apply only to App Store subscriptions', () => {
  const iap = { ...active, provider: 'app_store', iap_status: 'expired', iap_current_period_end: '2026-11-10' };
  assert.equal(subscriptionEnd(iap), '2026-11-10');
  assert.equal(subscriptionState(iap, now), 'inactive');
  assert.equal(subscriptionState({ ...iap, provider: 'none' }, now), 'active');
});

test('expired trials keep their known trial end without expiring active grants from old trial dates', () => {
  const oldTrial = { ...active, status: 'expired', trial_end: '2026-08-01', expires_at: null };
  assert.equal(subscriptionEnd(oldTrial), '2026-08-01');
  assert.equal(subscriptionEndLabel(oldTrial, now), 'Trial ended');
  assert.equal(subscriptionEnd({ ...oldTrial, status: 'active' }), null);
  assert.equal(subscriptionState({ ...oldTrial, status: 'active' }, now), 'active');
});

test('collection counts count copies, ignore ownerless rows, and sort zero above unknown', () => {
  assert.deepEqual(countCollectionRecords([{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: null }]), [{ customer_id: 'a', record_count: 2 }, { customer_id: 'b', record_count: 1 }]);
  assert.ok(compareProfileSubscriptions({ collection_record_count: 5 }, { collection_record_count: 0 }, 'records') < 0);
  assert.ok(compareProfileSubscriptions({ collection_record_count: 0 }, {}, 'records') < 0);
  assert.equal(isRekkrdConnection('https://cvqqiuhloefvaaacwxkg.supabase.co'), true);
  assert.equal(isRekkrdConnection('https://cvqqiuhloefvaaacwxkg.supabase.co.attacker.test'), false);
});

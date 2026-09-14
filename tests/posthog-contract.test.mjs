import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalEventType,
  DEFAULT_POSTHOG_EVENTS,
  DEFAULT_POSTHOG_PROPERTIES,
  getPosthogBranchDefaults,
  normalizePosthogEmail,
  posthogEventsForType,
  posthogLifecycleForBranch,
  qualifyPosthogEventId,
  sanitizePosthogProperties,
} from '../supabase/functions/_shared/posthog-contract.mjs';

test('maps lifecycle events and normalizes custom milestones', () => {
  assert.equal(canonicalEventType('user_signed_up'), 'product_signup');
  assert.equal(canonicalEventType('onboarding_completed'), 'product_onboarding_completed');
  assert.equal(canonicalEventType('lesson_completed'), 'product_feature_milestone');
});

test('Rekkrd signup and first record count as lifecycle events in reports and ingestion', () => {
  assert.equal(canonicalEventType('signup_completed'), 'product_signup');
  assert.ok(posthogEventsForType('product_signup').includes('signup_completed'));
  assert.equal(canonicalEventType('first_record_added'), 'product_activated');
  assert.ok(posthogEventsForType('product_activated').includes('first_record_added'));
  assert.equal(canonicalEventType('discogs_import_completed'), 'product_feature_milestone');
  assert.ok(!posthogEventsForType('product_onboarding_completed').includes('discogs_connected'));
});

test('Rekkrd defaults accept shipped product milestones and their categorical properties', () => {
  const defaults = getPosthogBranchDefaults('rekkrd');
  assert.deepEqual(defaults.allowed_events, [
    'signup_completed', 'first_record_added', 'discogs_connected',
    'discogs_import_completed', 'collection_value_viewed', 'third_spin_logged',
  ]);
  assert.deepEqual(sanitizePosthogProperties({
    platform: 'ios', surface: 'ios', placement: 'app', value: 12,
    source: 'https://rekkrd.com/private', campaign: 'private free text',
    email: 'collector@example.com', record_title: 'Private collection content',
  }, defaults.allowed_properties), { platform: 'ios', surface: 'ios', placement: 'app', value: 12 });
});

test('Rejoice keeps its deployed install proxy without applying it to Rekkrd', () => {
  const rejoice = posthogLifecycleForBranch('rejoice');
  assert.deepEqual(rejoice.signup_events, ['Application Installed']);
  assert.deepEqual(rejoice.onboarding_events, ['$identify']);
  assert.equal(rejoice.labels.signed_up, 'Installed');
  assert.equal(rejoice.conversion_labels.signup_to_onboarding, 'Install → identified');
  const rekkrd = posthogLifecycleForBranch('rekkrd');
  assert.ok(rekkrd.signup_events.includes('signup_completed'));
  assert.ok(!rekkrd.signup_events.includes('Application Installed'));
  assert.ok(rekkrd.activation_events.includes('first_record_added'));
  assert.equal(rekkrd.labels.signed_up, 'Signed up');
});

test('other branches retain the existing defaults and receive independent editable lists', () => {
  for (const slug of ['rejoice', 'unknown', undefined]) {
    assert.deepEqual(getPosthogBranchDefaults(slug), {
      allowed_events: DEFAULT_POSTHOG_EVENTS, allowed_properties: DEFAULT_POSTHOG_PROPERTIES,
    });
  }
  getPosthogBranchDefaults('rekkrd').allowed_events.push('custom_event');
  assert.ok(!getPosthogBranchDefaults('rekkrd').allowed_events.includes('custom_event'));
  assert.ok(posthogEventsForType('product_signup').includes('user_signed_up'));
  assert.ok(posthogEventsForType('product_activated').includes('activation_milestone_reached'));
});

test('keeps only approved categorical properties', () => {
  const sanitized = sanitizePosthogProperties({
    platform: 'ios',
    feature: 'daily-check-in',
    count: 3,
    nested: { unsafe: true },
    unknown: 'drop me',
  }, ['platform', 'feature', 'count', 'nested']);
  assert.deepEqual(sanitized, { platform: 'ios', feature: 'daily-check-in', count: 3 });
});

test('drops sensitive keys and free-text-like values even when allowlisted', () => {
  const sanitized = sanitizePosthogProperties({
    mood: 'anxious',
    prayer_text: 'private words',
    destination: 'https://letsrejoice.app/private',
    contact: 'person@example.com',
    platform: 'android',
  }, ['mood', 'prayer_text', 'destination', 'contact', 'platform']);
  assert.deepEqual(sanitized, { platform: 'android' });
});

test('normalizes valid email and rejects malformed identity values', () => {
  assert.equal(normalizePosthogEmail(' User@Example.com '), 'user@example.com');
  assert.equal(normalizePosthogEmail('anonymous-id'), null);
});

test('qualifies event IDs by project for cross-project idempotency', () => {
  assert.equal(qualifyPosthogEventId('123', '018f8b6a-1234'), '123:018f8b6a-1234');
  assert.equal(qualifyPosthogEventId('123', 'bad id'), null);
});

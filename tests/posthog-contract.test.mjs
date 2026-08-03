import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalEventType,
  normalizePosthogEmail,
  qualifyPosthogEventId,
  sanitizePosthogProperties,
} from '../supabase/functions/_shared/posthog-contract.mjs';

test('maps lifecycle events and normalizes custom milestones', () => {
  assert.equal(canonicalEventType('user_signed_up'), 'product_signup');
  assert.equal(canonicalEventType('onboarding_completed'), 'product_onboarding_completed');
  assert.equal(canonicalEventType('lesson_completed'), 'product_feature_milestone');
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

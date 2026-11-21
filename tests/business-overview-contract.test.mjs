import test from 'node:test';
import assert from 'node:assert/strict';
import { businessWindowBounds, buyerIdentity, computeFirstTimeBuyers, computeProfileRegistrations, isPaidOrder } from '../services/businessOverviewContract.mjs';

test('requires paid evidence and rejects terminal unpaid states', () => {
  assert.equal(isPaidOrder({ paid_at: '2026-09-19T12:00:00Z', status: 'pending' }), false);
  assert.equal(isPaidOrder({ status: 'completed' }), true);
  assert.equal(isPaidOrder({ status: 'refunded', paid_at: '2026-09-19T12:00:00Z' }), false);
});

test('normalizes buyer identity with email before customer id', () => {
  assert.equal(buyerIdentity({ billing_email: ' Buyer@Example.com ', customer_id: '123' }), 'email:buyer@example.com');
  assert.equal(buyerIdentity({ customer_id: '123' }), 'customer:123');
  assert.equal(buyerIdentity({}), null);
});

test('counts a buyer only when their first paid order lands in the window', () => {
  const now = new Date('2026-09-20T16:00:00Z').getTime();
  const orders = [
    { id: 'old', _spoke_id: 'atl', _source_table: 'legacy_orders', billing_email: 'old@example.com', status: 'completed', created_at: '2026-08-01T12:00:00Z' },
    { id: 'new-repeat', _spoke_id: 'atl', _source_table: 'orders', billing_email: 'old@example.com', status: 'paid', paid_at: '2026-09-19T12:00:00Z' },
    { id: 'new', _spoke_id: 'atl', _source_table: 'orders', guest_email: 'new@example.com', status: 'paid', paid_at: '2026-09-18T12:00:00Z' },
    { id: 'refund', _spoke_id: 'atl', _source_table: 'orders', guest_email: 'refund@example.com', status: 'refunded', paid_at: '2026-09-18T12:00:00Z' },
    { id: 'other', _spoke_id: 'other', guest_email: 'other@example.com', status: 'paid', paid_at: '2026-09-18T12:00:00Z' },
  ];
  assert.equal(computeFirstTimeBuyers(orders, 'atl', '7d', now), 1);
});

test('uses a half-open New York calendar interval', () => {
  const now = new Date('2026-09-20T16:00:00Z').getTime();
  const bounds = businessWindowBounds('7d', now);
  assert.equal(bounds.end, now);
  assert.equal(new Date(bounds.start).toISOString(), '2026-09-14T04:00:00.000Z');
});

test('respects the fall DST boundary for New York calendar days', () => {
  const now = new Date('2026-11-03T17:00:00Z').getTime();
  const bounds = businessWindowBounds('7d', now);
  assert.equal(new Date(bounds.start).toISOString(), '2026-10-28T04:00:00.000Z');
});

test('counts and deduplicates Sproutify Home profile registrations and newsletter opt-ins', () => {
  const now = new Date('2026-09-14T03:59:59Z').getTime();
  const profiles = [
    { id: '1', email: 'one@example.com', created_at: '2026-09-08T14:00:00Z', subscribed: true, _spoke_id: 'home' },
    { id: '2', email: 'two@example.com', created_at: '2026-09-09T14:00:00Z', subscribed: false, _spoke_id: 'home' },
    { id: 'duplicate', email: ' TWO@example.com ', created_at: '2026-09-09T15:00:00Z', subscribed: false, _spoke_id: 'home' },
    { id: '3', email: 'three@example.com', created_at: '2026-09-09T16:00:00Z', subscribed: false, _spoke_id: 'home' },
    { id: 'other', email: 'other@example.com', created_at: '2026-09-09T16:00:00Z', subscribed: true, _spoke_id: 'other' },
  ];
  assert.deepEqual(computeProfileRegistrations(profiles, 'home', '7d', now), { registrations: 3, newsletterOptIns: 1 });
});

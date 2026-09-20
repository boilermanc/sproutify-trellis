const DAY_MS = 86_400_000;

export const BUSINESS_TIME_ZONE = 'America/New_York';

const paidStatuses = new Set(['paid', 'processing', 'completed', 'fulfilled', 'shipped', 'delivered', 'succeeded']);
const rejectedStatuses = new Set(['cancelled', 'canceled', 'refunded', 'failed', 'void', 'voided', 'pending']);

function timestamp(value) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function zonedParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function zonedMidnight(year, month, day) {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(guess);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += target - represented;
  }
  return guess;
}

export function businessWindowBounds(window, now = Date.now()) {
  const days = window === '30d' ? 30 : 7;
  const current = zonedParts(now);
  const startDate = new Date(Date.UTC(current.year, current.month - 1, current.day - (days - 1)));
  const start = zonedMidnight(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate());
  return { start, end: now, days };
}

export function isPaidOrder(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  if (rejectedStatuses.has(status)) return false;
  return timestamp(order?.paid_at) !== null || paidStatuses.has(status);
}

export function buyerIdentity(order) {
  const email = String(order?.billing_email || order?.guest_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const customerId = String(order?.customer_id || '').trim();
  return customerId ? `customer:${customerId}` : null;
}

export function computeFirstTimeBuyers(orders, connectionId, window, now = Date.now()) {
  const { start, end } = businessWindowBounds(window, now);
  const firstPurchase = new Map();
  const seenOrders = new Set();

  for (const order of orders || []) {
    if (order?._spoke_id !== connectionId || !isPaidOrder(order)) continue;
    const identity = buyerIdentity(order);
    const occurredAt = timestamp(order.paid_at || order.created_at);
    if (!identity || occurredAt === null) continue;

    const orderKey = `${order._source_table || 'orders'}:${order.id || order.order_number || `${identity}:${occurredAt}`}`;
    if (seenOrders.has(orderKey)) continue;
    seenOrders.add(orderKey);

    const previous = firstPurchase.get(identity);
    if (previous === undefined || occurredAt < previous) firstPurchase.set(identity, occurredAt);
  }

  return [...firstPurchase.values()].filter(occurredAt => occurredAt >= start && occurredAt < end).length;
}

export function computeProfileRegistrations(profiles, connectionId, window, now = Date.now()) {
  const { start, end } = businessWindowBounds(window, now);
  const seen = new Set();
  let registrations = 0;
  let newsletterOptIns = 0;

  for (const profile of profiles || []) {
    if (profile?._spoke_id !== connectionId) continue;
    const occurredAt = timestamp(profile.created_at);
    if (occurredAt === null || occurredAt < start || occurredAt >= end) continue;
    const email = String(profile.email || '').trim().toLowerCase();
    const identity = email ? `email:${email}` : profile.id ? `id:${profile.id}` : null;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    registrations++;
    if (profile.subscribed === true) newsletterOptIns++;
  }

  return { registrations, newsletterOptIns };
}

export function formatBusinessRange(window, now = new Date()) {
  const days = window === '30d' ? 30 : 7;
  const current = zonedParts(now.getTime());
  const start = new Date(Date.UTC(current.year, current.month - 1, current.day - (days - 1), 12));
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: start.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return `${format.format(start)}–${format.format(now)} ET`;
}

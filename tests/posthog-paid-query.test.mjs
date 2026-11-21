import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Execute the deployed query's grouping/filtering against fixture events.
// SQLite supplies the numeric timestamp equivalent of HogQL's date functions.
const source = readFileSync(new URL('../supabase/functions/posthog-analytics/index.ts', import.meta.url), 'utf8');
const template = source.match(/`(SELECT count\(\) AS paid FROM \([\s\S]*?)`,\s*"Trellis first verified Home payments"/)[1];
const start = 1000000;
const cutoff = start + 40 * 86400;
const sql = template
  .replace('${trackingStartSeconds}', String(start))
  .replace('${sqlList(PAID_EVENTS)}', "'home payment confirmed'")
  .replace('now() - INTERVAL ${windowDays} DAY', String(cutoff));

test('payment query retains all tracked history and excludes renewals, duplicates and unverified events', () => {
  const db = new DatabaseSync(':memory:');
  db.function('toDateTime', value => value);
  db.exec('CREATE TABLE events (distinct_id TEXT, timestamp INTEGER, event TEXT, "properties.event_source" TEXT)');
  const insert = db.prepare('INSERT INTO events VALUES (?,?,?,?)');
  const add = (id, time, origin = 'verified_server', event = 'home payment confirmed') =>
    insert.run(id, time, event, origin);
  add('old-payer', start + 1);
  add('old-payer', cutoff + 1); // A renewal is not a new acquisition.
  add('new-payer', cutoff);
  add('new-payer', cutoff); // Duplicate delivery.
  add('new-payer', cutoff + 10); // Cross-provider repeat payment.
  add('another-new-payer', cutoff + 20);
  add('unverified', cutoff + 30, 'browser');
  add('signup-only', cutoff + 40, 'verified_server', 'home signup confirmed');
  add('pre-tracking', start - 1);
  const executable = sql.replaceAll('properties.event_source', '"properties.event_source"');
  assert.equal(db.prepare(executable).get().paid, 2);
  db.exec('DELETE FROM events');
  assert.equal(db.prepare(executable).get().paid, 0);
  db.close();
});

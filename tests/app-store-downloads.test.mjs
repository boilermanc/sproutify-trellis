import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDownloads, parseDownloadTsv, REKKRD_APPLE_ID, isDownloadReport, selectLatestDownloadDates } from '../supabase/functions/_shared/app-store-downloads.mjs';

const header = 'Date\tApp Apple Identifier\tDownload Type\tTerritory\tCounts';
const row = (type, count, territory = 'US', date = '2026-11-01', app = REKKRD_APPLE_ID) => `${date}\t${app}\t${type}\t${territory}\t${count}`;
test('accepts only the two standard download catalog titles, never detailed or installation reports', () => {
  assert.equal(isDownloadReport('App Downloads Standard'), true);
  assert.equal(isDownloadReport('App Store Downloads Standard'), true);
  assert.equal(isDownloadReport('App Store Downloads Detailed'), false);
  assert.equal(isDownloadReport('App Store Installation and Deletion Standard'), false);
});
test('counts are separated from identifiers, updates, restores and other apps', () => {
  const metrics = aggregateDownloads(parseDownloadTsv([header, row('First-time Download', 5), row('First-time Download', 2, 'CA'), row('Redownload', 3), row('Manual update', 4), row('Auto-update', 8), row('Restore', 9), row('First-time Download', 100, 'US', '2026-11-01', '6795355979')].join('\r\n'))).get('2026-11-01');
  assert.equal(metrics['First-Time Downloads'], 7);
  assert.equal(metrics.Redownloads, 3);
  assert.equal(metrics.Updates, 12);
  assert.equal(metrics['Total Downloads'], 10);
  assert.equal(metrics['Territory:CA:First-Time Downloads'], 2);
  assert.equal(metrics.Restores, 9);
});
test('all segments combine before latest processing date replaces complete event date', () => {
  const latest = aggregateDownloads(parseDownloadTsv([header, row('First-time Download', 2), row('Redownload', 1)].join('\n')));
  const older = aggregateDownloads(parseDownloadTsv([header, row('First-time Download', 8, 'CA')].join('\n')));
  const result = selectLatestDownloadDates([
    { instanceId: 'new', processingDate: '2026-11-03', dates: latest },
    { instanceId: 'old', processingDate: '2026-11-02', dates: older },
  ]).get('2026-11-01');
  assert.equal(result.metrics['First-Time Downloads'], 2);
  assert.equal(result.metrics['Territory:CA:First-Time Downloads'], undefined);
  assert.equal(result.instanceId, 'new');
});
test('rejects incomplete schemas, malformed counts, dates and unknown types', () => {
  assert.throws(() => parseDownloadTsv('Date\tCounts\n2026-11-01\t3'), /missing/);
  assert.throws(() => parseDownloadTsv(header + '\n2026-11-01'), /incomplete/);
  for (const line of [row('First-time Download', -1), row('New category', 1), row('Redownload', 1, 'US', '2026-02-30')]) {
    assert.throws(() => aggregateDownloads(parseDownloadTsv(header + '\n' + line)));
  }
});
test('a header-only report yields no fabricated zero dates', () => {
  assert.equal(aggregateDownloads(parseDownloadTsv(header)).size, 0);
});

test('accepts the category capitalization supplied by live Apple reports', () => {
  const values = aggregateDownloads(parseDownloadTsv([header, row('First-time download', 2), row('Redownload', 1), row('Manual Update', 3)].join('\n'))).get('2026-11-01');
  assert.equal(values['First-Time Downloads'], 2);
  assert.equal(values.Redownloads, 1);
  assert.equal(values.Updates, 3);
});

test('incremental processing retains a correction overlap and bootstraps legacy data', async () => {
  const { processingWindowStart } = await import('../supabase/functions/_shared/app-store-downloads.mjs');
  const now = Date.parse('2026-11-03T14:00:00Z');
  assert.equal(processingWindowStart('2026-11-03T09:00:00Z', true, now), '2026-10-31');
  assert.equal(processingWindowStart('2026-11-03T09:00:00Z', false, now), '2026-07-31');
  assert.equal(processingWindowStart('invalid', true, now), '2026-07-31');
  assert.equal(processingWindowStart('2026-11-10', true, now), '2026-07-31');
});

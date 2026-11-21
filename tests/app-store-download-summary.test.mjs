import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDownloads } from '../services/appStoreDownloadSummary.mjs';
test('missing data remains unknown and genuine zero is retained', () => {
  assert.equal(summarizeDownloads([]).totals.first, null);
  assert.equal(summarizeDownloads([{report_name:'App Downloads Standard',metric_date:'2026-11-01',metrics:{'First-Time Downloads':0}}]).totals.first, 0);
});
test('separates download categories and country totals without counting other reports', () => {
  const rows = [{report_name:'App Downloads Standard',metric_date:'2026-11-01',metrics:{'First-Time Downloads':3,Redownloads:2,Updates:10,'Territory:US:First-Time Downloads':3}}, {report_name:'App Sessions Standard',metric_date:'2026-11-01',metrics:{'First-Time Downloads':99}}];
  const result = summarizeDownloads(rows);
  assert.deepEqual(result.totals, {first:3,redownloads:2,updates:10});
  assert.deepEqual(result.countries,[['US',3]]);
  assert.equal(result.daily[0].first,3);
});
test('legacy generic counts and invalid metrics do not imply report coverage', () => {
  const result = summarizeDownloads([{report_name:'App Downloads Standard',metric_date:'2026-11-01',metrics:{Counts:42,'App Apple Identifier':6795955100}}, {report_name:'App Downloads Standard',metric_date:'2026-11-02',metrics:{'First-Time Downloads':-1}}]);
  assert.equal(result.totals.first,null);
  assert.deepEqual(result.daily,[]);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Reports exposes repeat-open, click, and post-open purchase cohorts', () => {
  const reports = read('pages/Reports.tsx');
  const panel = read('components/EmailPerformancePanel.tsx');
  const cohorts = read('components/EmailEngagementCohorts.tsx');

  assert.match(reports, /<EmailPerformancePanel[\s\S]*branches=/);
  assert.match(panel, /<EmailEngagementCohorts/);
  assert.match(cohorts, /Opened both/);
  assert.match(cohorts, /Opened 2 of 3/);
  assert.match(cohorts, /Opened 3 of 5/);
  assert.match(cohorts, /Clicked recently/);
  assert.match(cohorts, /Opened both → ordered/);
  assert.match(cohorts, /correlated, not attributed/i);
  assert.match(cohorts, /downloadCohort/);
});

test('engagement aggregate counts distinct campaigns with explicit view security', () => {
  const migration = read('supabase/migrations/20260819142126_add_distinct_campaign_engagement_counts.sql');
  const schema = read('constants.ts');

  for (const sql of [migration, schema]) {
    assert.match(sql, /security_invoker\s*=\s*true/);
    assert.match(sql, /COUNT\(DISTINCT campaign_id\)[\s\S]*AS campaigns_delivered/i);
    assert.match(sql, /COUNT\(DISTINCT campaign_id\)[\s\S]*AS campaigns_opened/i);
    assert.match(sql, /COUNT\(DISTINCT campaign_id\)[\s\S]*AS campaigns_clicked/i);
    assert.match(sql, /GRANT SELECT ON (?:public\.)?email_engagement_summary TO authenticated, service_role/i);
  }
});

test('frequent opener preset is targetable in Campaign Builder', () => {
  const types = read('segmentTypes.ts');
  const engine = read('segmentEngine.ts');
  const builder = read('pages/CampaignBuilder.tsx');
  const segments = read('Segments.tsx');

  assert.match(types, /name: 'Frequent Email Openers'/);
  assert.match(types, /field: 'campaigns_opened'[\s\S]*greater_or_equal'[\s\S]*value: 2/);
  assert.match(types, /field: 'last_opened_days_ago'[\s\S]*less_or_equal'[\s\S]*value: 60/);
  assert.match(engine, /case 'campaigns_opened'/);
  assert.match(builder, /fetchEngagementByEmail\(\)/);
  assert.match(builder, /evaluateSegment\(ep, seg, engagementByEmail, linkInterestByEmail\)/);
  assert.match(segments, /dedupeProfilesByEmail\(filterProfilesBySegment/);
});

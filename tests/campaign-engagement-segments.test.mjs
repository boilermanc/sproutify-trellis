import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared audience segments are protected and store orchestration rules only', () => {
  const migration = read('supabase/migrations/20260904202326_shared_campaign_engagement_segments.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.audience_segments/);
  assert.match(migration, /kind IN \('rules', 'link_interest', 'campaign_engagement'\)/);
  assert.doesNotMatch(migration, /email_list JSONB/i);
  assert.match(migration, /ALTER TABLE public\.audience_segments ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.audience_segments FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /private\.is_active_trellis_user/);
  assert.match(migration, /private\.can_manage_marketing/);
  assert.match(migration, /jsonb_path_ops/);
});

test('campaign engagement requires delivery to every selected campaign and an exact open count', () => {
  const types = read('segmentTypes.ts');
  const engine = read('segmentEngine.ts');
  const reporting = read('services/emailReportingService.ts');

  assert.match(types, /delivery_requirement: 'all_selected'/);
  assert.match(types, /opened_count: number/);
  assert.match(engine, /delivered !== selected\.size/);
  assert.match(engine, /opened === definition\.opened_count/);
  assert.match(reporting, /campaign_recipient_status_by_id/);
  assert.match(reporting, /query\.in\('campaign_id', ids\)/);
});

test('Segments UI selects newsletters and Campaign Builder re-evaluates the shared audience', () => {
  const segments = read('Segments.tsx');
  const builder = read('pages/CampaignBuilder.tsx');

  assert.match(segments, /Newsletter engagement/);
  assert.match(segments, /Opened exactly/);
  assert.match(segments, /Only people delivered every selected newsletter are eligible/);
  assert.match(segments, /saveSharedSegment/);
  assert.match(builder, /fetchSharedSegments/);
  assert.match(builder, /fetchCampaignEngagementByEmail/);
  assert.match(builder, /hub-campaign-engagement/);
  assert.match(builder, /consentFiltered/);
  assert.match(builder, /suppressedEmails/);
});

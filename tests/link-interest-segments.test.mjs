import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('link-interest migration derives historical click audiences securely', () => {
  const migration = read('supabase/migrations/20260820181856_add_link_interest_segments.sql');

  assert.match(migration, /CREATE OR REPLACE VIEW link_interest_clicks/);
  assert.match(migration, /WITH \(security_invoker = true\)/);
  assert.match(migration, /COALESCE\(link_url, metadata->'click'->>'link'\)/);
  assert.match(migration, /event_type = 'clicked'/);
  assert.match(migration, /NOT ILIKE '%unsubscribe%'/);
  assert.match(migration, /occurred_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /REVOKE ALL ON link_interest_clicks FROM PUBLIC/);
  assert.match(migration, /GRANT SELECT ON link_interest_clicks TO authenticated, service_role/);
  assert.doesNotMatch(migration, /^\+/m);
});

test('Home App Leads is a reusable dynamic sproutify.app intent segment', () => {
  const types = read('segmentTypes.ts');
  const engine = read('segmentEngine.ts');

  assert.match(types, /name: 'Home App Leads'/);
  assert.match(types, /url: 'https:\/\/sproutify\.app'/);
  assert.match(types, /match_type: 'domain'/);
  assert.match(types, /recommended_branches: \['atlurbanfarms'\]/);
  assert.match(types, /kind: 'link_interest'/);
  assert.match(engine, /\? candidate\.hostname === target\.hostname/);
  assert.doesNotMatch(engine, /hostname\.endsWith/);
  assert.match(engine, /candidate\.canonical\.startsWith\(target\.canonical\)/);
  assert.match(engine, /definition\.campaign_subjects/);
  assert.match(engine, /definition\.lookback_days/);
  assert.match(engine, /definition\.min_clicks/);
});

test('Segments and Campaign Builder share link-intent membership and retain consent gates', () => {
  const segments = read('Segments.tsx');
  const builder = read('pages/CampaignBuilder.tsx');

  assert.match(segments, /fetchLinkInterestByEmail/);
  assert.match(segments, /Entire domain/);
  assert.match(segments, /URL starts with/);
  assert.match(segments, /Historical and future Resend clicks/);
  assert.match(segments, /hub-link-interest/);
  assert.match(builder, /fetchLinkInterestByEmail/);
  assert.match(builder, /evaluateSegment\(ep, seg, engagementByEmail, linkInterestByEmail\)/);
  assert.match(builder, /Newsletter-only clickers/);
  assert.match(builder, /for \(const email of linkInterestByEmail\.keys\(\)\)/);
  assert.match(builder, /authoritativeNewsletterAudience \? authoritativeNewsletterProfiles : scopedProfiles/);
  assert.match(builder, /saved_segment_snapshot/);
  assert.match(builder, /handedOffSegment\.recommended_branches/);
  assert.match(builder, /consentFiltered/);
  assert.match(builder, /suppressedEmails/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [research, service, migration, constants] = await Promise.all([
  readFile(new URL('../supabase/functions/_shared/spectiq-prospect-research.ts', import.meta.url), 'utf8'),
  readFile(new URL('../services/prospectingResearchService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260912005803_add_spectiq_research_snapshot_contract.sql', import.meta.url), 'utf8'),
  readFile(new URL('../constants.ts', import.meta.url), 'utf8'),
]);

test('research schema returns screenshot intelligence and evidence-backed classifications', () => {
  for (const field of [
    'fit_score', 'fit_category', 'website_presence_class', 'phone_only_quote',
    'manual_quote_process', 'current_stack', 'friction_point',
    'opportunity_hypothesis', 'draft_pitch',
  ]) assert.match(research, new RegExp(`\\b${field}\\b`), `${field} is represented`);
  assert.match(research, /rawFitScore[\s\S]{0,220}rawFitScore\s*>=\s*0[\s\S]{0,100}rawFitScore\s*<=\s*100/);
  assert.doesNotMatch(research, /\b(?:minimum|maximum):/);
  assert.match(research, /phone_only_quote[\s\S]{0,120}\["boolean",\s*"null"\]/);
  assert.match(research, /manual_quote_process[\s\S]{0,120}\["boolean",\s*"null"\]/);
  assert.match(research, /fit_score_rubric_version:\s*"spectiq-fit-v1"/);
});

test('fit and pitch remain advisory, uncertain, and manually reviewed', () => {
  assert.match(research, /not a sales probability/i);
  assert.match(research, /null when unknown/i);
  assert.match(research, /founder-review draft/i);
  assert.match(research, /assessment_requires_founder_review:\s*true/);
  assert.match(migration, /'outreach_approved',\s*false/);
  assert.doesNotMatch(service, /send(?:Email|Resend)|approveProspectPitchReady/);
});

test('territory market factors have attributable evidence and founder-only review', () => {
  assert.match(research, /market_factors/);
  for (const field of ['title', 'summary', 'category', 'source_url', 'source_type', 'source_excerpt', 'confidence']) {
    assert.match(research, new RegExp(`\\b${field}\\b`));
  }
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.spectiq_territory_market_factors/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /private\.is_spectiq_prospecting_founder/i);
  assert.match(migration, /review_spectiq_territory_market_factor/i);
  assert.match(migration, /verification_decision[\s\S]{0,200}'pending'[\s\S]{0,200}'approved'[\s\S]{0,200}'corrected'[\s\S]{0,200}'rejected'/i);
});

test('imported prospect snapshots use metadata rather than bypassing evidence claims', () => {
  assert.match(migration, /jsonb_set[\s\S]{0,160}'\{research_snapshot\}'/i);
  assert.match(migration, /candidate_review_status/i);
  assert.match(migration, /spectiq_sync_research_snapshot/i);
  assert.match(constants, /20260912005803_add_spectiq_research_snapshot_contract\.sql\?raw/);
  assert.match(constants, /\$\{SPECTIQ_RESEARCH_SNAPSHOT_SQL_SCHEMA\}/);
  assert.match(service, /getResearchCandidateSnapshot/);
  assert.match(service, /getProspectResearchSnapshot/);
  assert.match(service, /claims_pending|claims_reviewed/);
  assert.match(service, /getProspectingResearchKpis/);
});

test('market-factor Data API access is explicit and service-role writes stay server-side', () => {
  assert.match(migration, /REVOKE ALL ON TABLE public\.spectiq_territory_market_factors FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, UPDATE[\s\S]{0,300}TO authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]{0,150}TO service_role/i);
  assert.doesNotMatch(service, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

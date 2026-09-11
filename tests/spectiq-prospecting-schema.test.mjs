import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260911202452_add_spectiq_prospecting_foundation.sql',
  import.meta.url,
);

const sql = await readFile(migrationPath, 'utf8');
const constants = await readFile(new URL('../constants.ts', import.meta.url), 'utf8');

const requiredTables = [
  'spectiq_prospecting_territories',
  'spectiq_prospects',
  'spectiq_prospect_contacts',
  'spectiq_prospect_claims',
  'spectiq_prospect_notes',
  'spectiq_prospect_tasks',
  'spectiq_prospect_activity',
  'spectiq_prospect_conversion_milestones',
];

test('creates an isolated Phase 1 SpectIQ prospecting model', () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i'));
  }

  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.leads\b/i);
  assert.doesNotMatch(sql, /lead_pipelines|lead_email_sequences/i);
  assert.doesNotMatch(sql, /manus_api_key|resend_api_key|email_drafts|email_sends/i);
});

test('includes the exact prospecting migration in the Schema Engine master stamp', () => {
  assert.match(constants, /import SPECTIQ_PROSPECTING_SQL_SCHEMA from '\.\/supabase\/migrations\/20260911202452_add_spectiq_prospecting_foundation\.sql\?raw';/);
  assert.match(constants, /\$\{SPECTIQ_PROSPECTING_SQL_SCHEMA\}/);
});

test('requires the active SpectIQ platform-super-admin account', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'standard'/i);
  assert.match(sql, /platform_role IN \('standard', 'platform_super_admin'\)/i);
  assert.match(sql, /lower\(email\) = 'clint@sproutify\.app'/i);
  assert.match(sql, /u\.status = 'active'/i);
  assert.match(sql, /u\.role = 'owner'/i);
  assert.match(sql, /u\.platform_role = 'platform_super_admin'/i);
  assert.doesNotMatch(sql, /auth\.jwt\(\)->>'aal'|aal2|mfa_ok/i);
  assert.match(sql, /spectiq_prospecting_access_status/i);
  assert.match(sql, /spectiq_prospecting_access_status\(\)[\s\S]*?SECURITY INVOKER/i);
  assert.match(sql, /'role_ok'.*'authorized'/is);
});

test('models website, sales, and verification uncertainty independently', () => {
  for (const state of [
    'official_website_confirmed',
    'official_website_not_identified',
    'website_unreachable_at_scan_time',
    'social_or_directory_only_observed',
    'needs_human_verification',
  ]) assert.match(sql, new RegExp(`'${state}'`));

  for (const state of [
    'new', 'audited', 'review_pending', 'pitch_ready', 'contacted', 'engaged',
    'demo_booked', 'won', 'nurture', 'not_a_fit',
  ]) assert.match(sql, new RegExp(`'${state}'`));

  for (const state of [
    'unreviewed', 'evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved',
  ]) assert.match(sql, new RegExp(`'${state}'`));
});

test('blocks pitch-ready without verified evidence, outreach copy, contact, and founder approval', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.enforce_spectiq_pitch_ready/i);
  assert.match(sql, /NEW\.verification_state <> 'outreach_approved'/i);
  assert.match(sql, /NEW\.pitch_ready_approved_by IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /c\.claim_type = 'outreach_angle'/i);
  assert.match(sql, /c\.verification_decision IN \('approved', 'corrected'\)/i);
  assert.match(sql, /c\.email_status = 'verified'/i);
  assert.match(sql, /c\.suppressed_at IS NULL/i);
  assert.match(sql, /CREATE TRIGGER spectiq_pitch_ready_guard/i);
  assert.match(sql, /approve_spectiq_prospect_pitch_ready\(p_prospect_id UUID\)/i);
  assert.match(sql, /pitch_ready_approved_by = \(SELECT auth\.uid\(\)\)/i);
});

test('keeps evidence attributable and conversion separate from commercial win', () => {
  for (const field of [
    'source_url', 'source_type', 'source_excerpt', 'artifact_ref', 'retrieved_at',
    'confidence', 'research_run_id', 'prompt_version', 'rubric_version',
    'verification_decision', 'founder_correction',
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`, 'i'));

  for (const milestone of [
    'commercial_commitment', 'organization_created', 'owner_invited', 'activated', 'onboarding_failed',
  ]) assert.match(sql, new RegExp(`'${milestone}'`));
});

test('enforces deduplication, immutable activity, RLS, and least grants', () => {
  assert.match(sql, /idx_spectiq_prospects_official_domain/i);
  assert.match(sql, /idx_spectiq_prospects_name_geography/i);
  assert.match(sql, /idx_spectiq_contacts_verified_email/i);
  assert.match(sql, /idx_spectiq_contacts_verified_phone/i);
  assert.match(sql, /CREATE TRIGGER spectiq_activity_immutable/i);
  assert.match(sql, /RAISE EXCEPTION 'SpectIQ prospect activity is immutable'/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.audit_spectiq_record_change/i);
  for (const trigger of [
    'spectiq_audit_territory', 'spectiq_audit_prospect', 'spectiq_audit_contact',
    'spectiq_audit_claim', 'spectiq_audit_note', 'spectiq_audit_task', 'spectiq_audit_conversion',
  ]) assert.match(sql, new RegExp(`CREATE TRIGGER ${trigger}`, 'i'));

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.%I ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(sql, new RegExp(`'${table}'`));
  }

  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.spectiq_prospect_activity TO authenticated/i);
  assert.doesNotMatch(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.spectiq_prospect_activity/i);
  assert.doesNotMatch(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[^;]+TO authenticated/i);
});

test('server-stamps trusted actors and verification transition timestamps', () => {
  assert.match(sql, /NEW\.created_by := \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /NEW\.updated_by := \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /jsonb_set\(payload, '\{actor_id\}', to_jsonb\(current_actor\)\)/i);
  assert.match(sql, /jsonb_set\(payload, '\{verified_by\}', to_jsonb\(current_actor\)\)/i);
  assert.match(sql, /NEW\.evidence_reviewed_at := now\(\)/i);
  assert.match(sql, /NEW\.identity_verified_at := now\(\)/i);
  assert.match(sql, /NEW\.outreach_approved_at := now\(\)/i);
});

test('exports founder-filtered rows with redaction, CSV neutralization, and an audit event', () => {
  assert.match(sql, /export_spectiq_prospects\(\s*p_prospect_ids UUID\[\] DEFAULT NULL,\s*p_territory_id UUID DEFAULT NULL,\s*p_redacted BOOLEAN DEFAULT true/is);
  assert.match(sql, /Active platform super administrator access is required for prospect export/i);
  assert.match(sql, /activity_type, actor_id, details[\s\S]*'exported'/i);
  assert.match(sql, /WHEN p\.company_name ~ '\^\[=\+\\-@\]'/i);
  assert.match(sql, /WHEN p_redacted THEN NULL ELSE c\.email END/i);
  assert.match(sql, /p\.id = ANY\(p_prospect_ids\)/i);
  assert.match(sql, /p\.territory_id = p_territory_id/i);
});

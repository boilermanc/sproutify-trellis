import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/20260825162352_add_promo_studio_foundation.sql', import.meta.url), 'utf8');

const promoTables = [
  'promo_projects', 'promo_manifest_revisions', 'promo_claims', 'promo_assets', 'promo_scenes',
  'promo_voice_takes', 'promo_music_takes', 'promo_capture_scenarios', 'promo_capture_runs',
  'promo_jobs', 'promo_job_attempts', 'promo_approvals', 'promo_events',
];

test('Promo foundation creates every required domain table and a private bucket', () => {
  for (const table of promoTables) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
  assert.match(sql, /'promo-assets',\s*'promo-assets',\s*false/);
  assert.match(sql, /allowed_mime_types/);
});

test('all Promo tables force RLS and browser access remains read-only', () => {
  assert.match(sql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.%I TO authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*TO authenticated/i);
  assert.match(sql, /private\.can_access_promo_project/);
  assert.match(sql, /u\.auth_user_id = \(SELECT auth\.uid\(\)\)/);
});

test('storage reads require both registered ready asset and project access', () => {
  assert.match(sql, /Promo asset objects follow project access/);
  assert.match(sql, /bucket_id = 'promo-assets'/);
  assert.match(sql, /asset\.storage_path = storage\.objects\.name/);
  assert.match(sql, /asset\.status = 'ready'/);
  assert.match(sql, /private\.can_access_promo_project\(asset\.project_id\)/);
  assert.doesNotMatch(sql, /storage\.objects[\s\S]*FOR INSERT TO authenticated/i);
});

test('atomic claim uses SKIP LOCKED, dependency success, leases, and attempt history', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_promo_job/);
  assert.match(sql, /FOR UPDATE OF j SKIP LOCKED/);
  assert.match(sql, /upstream\.status <> 'succeeded'/);
  assert.match(sql, /lease_expires_at < now\(\)/);
  assert.match(sql, /attempt_count = j\.attempt_count \+ 1/);
  assert.match(sql, /INSERT INTO public\.promo_job_attempts/);
  assert.match(sql, /PROMO_JOB_LEASE_EXPIRED/);
});

test('worker transitions require matching identity, lease token, and unexpired lease', () => {
  for (const name of ['heartbeat_promo_job', 'complete_promo_job', 'fail_promo_job']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}`));
  }
  assert.match(sql, /worker_id = p_worker_id[\s\S]*lease_token = p_lease_token[\s\S]*lease_expires_at >= now\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_promo_job\(TEXT, INTEGER, JSONB\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_promo_job\(TEXT, INTEGER, JSONB\) TO service_role/);
});

test('queue and foreign-key access paths are indexed', () => {
  assert.match(sql, /idx_promo_jobs_claimable[\s\S]*WHERE status IN \('queued','running'\)/);
  assert.match(sql, /idx_promo_jobs_revision/);
  assert.match(sql, /idx_promo_revisions_parent/);
  assert.match(sql, /idx_promo_events_attempt/);
  assert.match(sql, /USING GIN \(dependency_job_ids jsonb_path_ops\)/);
});

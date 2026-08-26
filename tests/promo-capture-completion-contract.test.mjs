import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('capture completion is service-role-only, leased, branch-bound, and atomic', async () => {
  const [migration, constants] = await Promise.all([
    read('../supabase/migrations/20260826180018_complete_promo_capture_job.sql'), read('../constants.ts'),
  ]);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_promo_capture_job\(/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(migration, /job_type = 'capture'[\s\S]*status = 'running'[\s\S]*lease_expires_at >= now\(\)[\s\S]*FOR UPDATE/);
  assert.match(migration, /current_revision_id = claimed\.revision_id/);
  assert.match(migration, /promo_branch_sources[\s\S]*branch_id = project_row\.branch_id[\s\S]*is_active = true/);
  assert.match(migration, /expected_commit_sha/);
  assert.match(migration, /jsonb_array_elements\(scenario_row\.definition -> 'assertions'\)/);
  assert.match(migration, /actual ->> 'passed' = 'true'/);
  assert.match(migration, /masks_applied/);
  assert.match(migration, /INSERT INTO public\.promo_capture_runs/);
  assert.match(migration, /UPDATE public\.promo_capture_scenarios SET status = 'verified'/);
  assert.match(migration, /UPDATE public\.promo_jobs[\s\S]*status = 'succeeded'/);
  assert.match(migration, /UPDATE public\.promo_job_attempts[\s\S]*status = 'succeeded'/);
  assert.match(migration, /EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR raise_exception THEN/);
  const afterFirstAssetInsert = migration.slice(migration.indexOf('INSERT INTO public.promo_assets'));
  assert.doesNotMatch(afterFirstAssetInsert, /THEN RETURN false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_promo_capture_job[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_promo_capture_job[\s\S]*TO service_role/);
  assert.match(constants, /PROMO_CAPTURE_COMPLETION_SQL_SCHEMA/);
  assert.match(constants, /\$\{PROMO_CAPTURE_COMPLETION_SQL_SCHEMA\}/);
});
test('capture artifacts require deterministic private paths and byte-bound Storage metadata', async () => {
  const migration = await read('../supabase/migrations/20260826180018_complete_promo_capture_job.sql');
  assert.match(migration, /'\/capture\.mp4'/);
  assert.match(migration, /'\/capture\.png'/);
  assert.match(migration, /'\/trace\.json'/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /bucket_id = 'promo-assets'/);
  assert.match(migration, /user_metadata ->> 'input_fingerprint'/);
  assert.match(migration, /payload_fingerprint_sha256/);
  assert.match(migration, /octet_length\(convert_to\(p_evidence::TEXT, 'UTF8'\)\)/);
  assert.equal((migration.match(/INSERT INTO public\.promo_assets/g) || []).length, 3);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const canonicalQaNumber = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;

const postgresJsonbText = value => {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(', ')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((left, right) => {
      const leftBytes = Buffer.from(left);
      const rightBytes = Buffer.from(right);
      return leftBytes.length - rightBytes.length || Buffer.compare(leftBytes, rightBytes);
    });
    return `{${keys.map(key => `${JSON.stringify(key)}: ${postgresJsonbText(value[key])}`).join(', ')}}`;
  }
  return JSON.stringify(value);
};

test('render completion is service-role-only and bound to an active render lease', async () => {
  const [migration, constants] = await Promise.all([
    read('../supabase/migrations/20260825211425_complete_promo_render_job.sql'), read('../constants.ts'),
  ]);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_promo_render_job\(/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(migration, /j\.job_type IN \('preview_render', 'final_render'\)/);
  assert.match(migration, /j\.status = 'running'/);
  assert.match(migration, /j\.worker_id = trim\(p_worker_id\)/);
  assert.match(migration, /j\.lease_token = p_lease_token/);
  assert.match(migration, /j\.lease_expires_at >= now\(\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_promo_render_job[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_promo_render_job[\s\S]*TO service_role/);
  assert.match(constants, /PROMO_RENDER_COMPLETION_SQL_SCHEMA/);
  assert.match(constants, /\$\{PROMO_RENDER_COMPLETION_SQL_SCHEMA\}/);
});

test('completion accepts only deterministic private objects and the proven delivery profile', async () => {
  const migration = await read('../supabase/migrations/20260825211425_complete_promo_render_job.sql');
  assert.match(migration, /claimed\.project_id::TEXT \|\| '\/' \|\| p_render_asset_id::TEXT/);
  assert.match(migration, /claimed\.project_id::TEXT \|\| '\/' \|\| p_qa_asset_id::TEXT \|\| '\/qa\.json'/);
  assert.match(migration, /SELECT o\.id, o\.version, o\.metadata, o\.user_metadata INTO render_object/);
  assert.match(migration, /SELECT o\.id, o\.version, o\.metadata, o\.user_metadata INTO qa_object/);
  assert.match(migration, /o\.bucket_id = 'promo-assets'/);
  assert.match(migration, /render_object\.metadata ->> 'size'[\s\S]*p_render_file_size_bytes/);
  assert.match(migration, /qa_object\.metadata ->> 'size'[\s\S]*p_qa_file_size_bytes/);
  assert.match(migration, /render_object\.user_metadata ->> 'sha256' IS DISTINCT FROM p_render_checksum_sha256/);
  assert.match(migration, /qa_object\.user_metadata ->> 'sha256' IS DISTINCT FROM p_qa_checksum_sha256/);
  assert.match(migration, /user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed\.input_fingerprint/);
  assert.match(migration, /payload_fingerprint_sha256' IS DISTINCT FROM qa_payload_fingerprint/);
  assert.match(migration, /extensions\.digest\(convert_to\(p_qa::TEXT, 'UTF8'\), 'sha256'\)/);
  assert.match(migration, /expected_ffmpeg_fingerprint}' IS NULL/);
  assert.match(migration, /expected_ffmpeg_fingerprint}' !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(migration, /p_qa_checksum_sha256 IS DISTINCT FROM qa_payload_fingerprint/);
  assert.match(migration, /p_qa_file_size_bytes <> octet_length\(convert_to\(p_qa::TEXT, 'UTF8'\)\)/);
  for (const value of [
    "'1080'", "'1920'", "'30'", "'h264'", "'yuv420p'", "'aac'", "'48000'", "'true'", "'tv'",
  ]) assert.match(migration, new RegExp(value));
  assert.match(migration, /abs\(p_duration_seconds - target_seconds\) > 0\.05/);
  assert.match(migration, /qa_lufs NOT BETWEEN -14\.5 AND -13\.5/);
  assert.match(migration, /qa_true_peak > -1\.5/);
  assert.match(migration, /\(p_qa ->> 'ffmpeg_fingerprint'\) IS DISTINCT FROM \(claimed\.input/);
  assert.match(migration, /p_qa ->> 'input_fingerprint' IS DISTINCT FROM claimed\.input_fingerprint/);
});

test('QA upload fingerprint uses the documented PostgreSQL JSONB text bytes', async () => {
  const boundary = await read('../workers/promo-render-worker/README.md');
  const qa = {
    width: 1080,
    passed: true,
    schema_version: '1.0.0',
    integrated_lufs: -14,
    duration_seconds: 10,
  };
  const canonical = postgresJsonbText(qa);
  assert.equal(
    canonical,
    '{"width": 1080, "passed": true, "schema_version": "1.0.0", "integrated_lufs": -14, "duration_seconds": 10}',
  );
  assert.equal(
    createHash('sha256').update(canonical, 'utf8').digest('hex'),
    'cbc00cbffec01dd8be8d837e848ea6ee8a51998ab65ecf5a348c8fb61f145af2',
  );
  assert.equal(canonicalQaNumber.test('10.5'), true);
  assert.equal(canonicalQaNumber.test('10.50'), false);
  assert.equal(canonicalQaNumber.test('1.05e1'), false);
  assert.match(boundary, /upload those exact canonical UTF-8 bytes\s+as `qa\.json`/);
  assert.match(boundary, /`sha256` and `payload_fingerprint_sha256` metadata values must\s+therefore be identical/);
  assert.match(boundary, /no trailing zero in a fractional part/);
});

test('asset registration, attempt completion, job completion, and audit are one transaction', async () => {
  const [migration, boundary, worker] = await Promise.all([
    read('../supabase/migrations/20260825211425_complete_promo_render_job.sql'),
    read('../workers/promo-render-worker/README.md'),
    read('../supabase/functions/promo-worker/index.ts'),
  ]);
  assert.equal((migration.match(/INSERT INTO public\.promo_assets/g) || []).length, 2);
  assert.match(migration, /'render_preview'[\s\S]*'render_master'/);
  assert.match(migration, /'qa_report'/);
  assert.match(migration, /UPDATE public\.promo_jobs[\s\S]*status = 'succeeded'/);
  assert.match(migration, /UPDATE public\.promo_job_attempts[\s\S]*status = 'succeeded'/);
  assert.match(migration, /IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo render attempt was not found'/);
  assert.match(migration, /INSERT INTO public\.promo_events/);
  assert.match(boundary, /must not use the generic `complete_promo_job`/i);
  assert.match(boundary, /A `false` result means the lease or contract is invalid/i);
  assert.match(boundary, /without\s+upsert/i);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /complete_promo_render_job/);
});

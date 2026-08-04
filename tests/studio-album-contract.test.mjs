import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('allows concurrent generation jobs for different tracks', async () => {
  const migration = await read('supabase/migrations/20260804111707_fix_studio_track_job_concurrency.sql');
  assert.match(migration, /DROP INDEX IF EXISTS idx_studio_one_active_job_per_type/);
  assert.match(migration, /idx_studio_one_active_track_job[\s\S]*album_id, job_type, track_id/);
  assert.match(migration, /idx_studio_one_active_album_job[\s\S]*track_id IS NULL/);
});

test('bulk audio approval only includes ready Studio assets', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /approve_all_generated_tracks/);
  assert.match(fn, /eq\("review_status", "pending_review"\)\.not\("studio_asset_id", "is", null\)/);
  assert.match(fn, /Promise\.all\(readyIds\.map\(\(trackId: string\) => trackWithAsset/);
});

test('batch generation reports partial failures instead of hiding queued tracks', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /const concurrency = 3/);
  assert.match(fn, /return json\(\{ tracks, failures \}, failures\.length \? 207 : 201\)/);
});

test('review UI explains and confirms approve-all behavior', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(page, /Reject any exceptions first, then approve everything remaining/);
  assert.match(page, /Approve all ready/);
  assert.match(page, /Rejected, failed, and unfinished tracks will not be changed/);
  assert.match(page, /Return this approved track to audio review/);
});

test('music generation carries the planned runtime into the Lyria prompt', async () => {
  const fn = await read('supabase/functions/generate-session-track/index.ts');
  assert.match(fn, /const useClip = duration === 30/);
  assert.match(fn, /Create an approximately \$\{formatTargetDuration\(duration\)\} piece/);
  assert.match(fn, /input: `\$\{durationDirection\} \$\{track\.prompt\}`/);
});

test('Studio planning does not promise sub-30-second Lyria tracks', async () => {
  const planning = await read('services/studioAlbumPlanning.ts');
  const albumApi = await read('supabase/functions/studio-albums/index.ts');
  assert.match(planning, /STUDIO_MIN_TRACK_SECONDS = 30/);
  assert.match(albumApi, /studioTrack\.duration_seconds < 30/);
});

test('master review distinguishes measured runtime from the plan', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(page, /Measured master runtime/);
  assert.match(page, /hasMaterialMasterVariance/);
  assert.match(page, /Approve it anyway/);
  assert.match(page, /planned \{track\.duration_seconds/);
});

test('Studio video webhook honors the documented secret name', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /Deno\.env\.get\("STUDIO_VIDEO_RENDER_WEBHOOK"\) \|\| Deno\.env\.get\("STUDIO_VIDEO_WEBHOOK"\)/);
});

test('Studio publishing stays isolated from Episode state', async () => {
  const migration = await read('supabase/migrations/20260804121548_add_studio_album_publications.sql');
  const workflow = await read('n8n-blueprints/E10-studio-album-publish.json');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS studio_publications/);
  assert.match(migration, /ALTER TABLE studio_publications ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /album\.created_by = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(workflow, /trellis_episode_publications|trellis_episodes/);
});

test('Studio publishing requires review and has a durable failure path', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const panel = await read('components/StudioPublishingPanel.tsx');
  const workflow = JSON.parse(await read('n8n-blueprints/E10-studio-album-publish.json'));
  assert.match(fn, /approve_publication/);
  assert.match(fn, /publication\.status !== "ready"/);
  assert.match(panel, /Submit .* to YouTube as/);
  assert.match(panel, /New releases default to private/);
  assert.ok(workflow.nodes.some(node => node.name === 'Build Studio Failure'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publication'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Album Publishing'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publish Job'));
});

test('unsupported publishing promises remain visibly disabled', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const panel = await read('components/StudioPublishingPanel.tsx');
  const workflow = await read('n8n-blueprints/E10-studio-album-publish.json');
  assert.match(fn, /Scheduled YouTube publishing is not enabled yet/);
  assert.match(panel, /Scheduling stays disabled/);
  assert.match(workflow, /Scheduling and custom-thumbnail upload are intentionally disabled/);
});

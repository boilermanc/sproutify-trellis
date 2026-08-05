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
  const confirmation = await read('components/ConfirmationModal.tsx');
  assert.match(page, /Reject any exceptions first, then approve everything remaining/);
  assert.match(page, /Approve all ready/);
  assert.match(page, /Rejected, failed, and unfinished tracks will not be changed/);
  assert.match(page, /Return this approved track to audio review/);
  assert.match(confirmation, /role="alertdialog"/);
  assert.match(confirmation, /aria-modal="true"/);
});

test('Studio actions avoid browser-native confirmation dialogs', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  const publishing = await read('components/StudioPublishingPanel.tsx');
  assert.doesNotMatch(page, /window\.confirm/);
  assert.doesNotMatch(publishing, /window\.confirm/);
  assert.match(page, /<ConfirmationModal/);
  assert.match(publishing, /<ConfirmationModal/);
});

test('Studio surfaces Edge Function messages and only retries safe reads', async () => {
  const service = await read('services/studioAlbumsService.ts');
  assert.match(service, /FunctionsHttpError/);
  assert.match(service, /error\.context\.clone\(\)\.json\(\)/);
  assert.match(service, /RETRYABLE_STUDIO_READS = new Set\(\['list', 'tracks', 'list_cover_concepts'\]\)/);
  assert.match(service, /details\.status === 503/);
});

test('production compiles Tailwind instead of loading the CDN runtime', async () => {
  const html = await read('index.html');
  const css = await read('index.css');
  const tailwind = await read('tailwind.config.cjs');
  const postcss = await read('postcss.config.cjs');
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.match(css, /@tailwind utilities/);
  assert.match(tailwind, /content:/);
  assert.match(postcss, /autoprefixer/);
});

test('album brief suggestions use a reliable editable combobox', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(page, /role="listbox"/);
  assert.match(page, /You can also type your own/);
  assert.match(page, /Show \$\{label\.toLowerCase\(\)\} suggestions/);
  assert.doesNotMatch(page, /<datalist/);
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
  assert.match(page, /Approve this master anyway/);
  assert.match(page, /planned \{track\.duration_seconds/);
});

test('Studio video webhook honors the documented secret name', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /Deno\.env\.get\("STUDIO_VIDEO_RENDER_WEBHOOK"\) \|\| Deno\.env\.get\("STUDIO_VIDEO_WEBHOOK"\)/);
});

test('Studio cover generation treats subject and Riviera direction as hard constraints', async () => {
  const constants = await read('constants.ts');
  const page = await read('pages/StudioAlbums.tsx');
  const service = await read('services/studioAlbumsService.ts');
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(constants, /name: 'Riviera Editorial Photo'/);
  assert.match(constants, /real Côte d’Azur architecture and coastline/);
  assert.match(page, /useState\('photoreal_60s'\)/);
  assert.match(page, /custom_direction: coverDirection/);
  assert.match(service, /interface StudioCoverDirection/);
  assert.match(fn, /USER DIRECTION — HIGHEST PRIORITY/);
  assert.match(fn, /Exactly one adult woman is the only human figure anywhere/);
  assert.match(fn, /real French Riviera \/ Côte d’Azur/);
  assert.match(fn, /No tropical jungle, waterfall, volcano/);
});

test('Studio covers are editable, removable, and titled before approval', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  const composer = await read('components/StudioCoverComposer.tsx');
  const service = await read('services/studioAlbumsService.ts');
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(page, /<StudioCoverComposer/);
  assert.match(page, /Enhance selected/);
  assert.match(page, /requestDeleteCover/);
  assert.match(page, /Approve titled cover/);
  assert.match(page, /visualProductionRef\.current\?\.scrollIntoView/);
  assert.match(page, /catch \(error\) \{ addToast\(error instanceof Error \? error\.message : 'The requested action could not be completed\.'/);
  assert.match(page, /Delete unused/);
  assert.match(page, /Create another concept/);
  assert.match(page, /Create an alternate without deleting the approved cover/);
  assert.match(composer, /Rekkrd After Dark/);
  assert.match(composer, /Riviera Editorial/);
  assert.match(composer, /Travel Poster/);
  assert.match(composer, /After Dark/);
  assert.match(composer, /Vintage postcard border/);
  assert.match(service, /save_cover_composite/);
  assert.match(service, /enhance_cover_concept/);
  assert.match(service, /delete_cover_concept/);
  assert.match(fn, /role: "titled_cover"/);
  assert.match(fn, /Finish and save the cover typography before approving it/);
  assert.doesNotMatch(fn, /selection_status === "approved" \|\| album\.artwork_status === "approved"/);
  assert.match(fn, /The approved cover cannot be deleted\. Choose an unused concept instead\./);
  assert.match(fn, /source image for the approved cover and must be kept/);
  assert.doesNotMatch(fn, /remove\(\[asset\.storage_path\]\)/);
  assert.match(fn, /\["selected", "approved"\]\.includes/);
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
  assert.match(panel, /Submit .* to YouTube with/);
  assert.match(panel, /New releases default to private/);
  assert.ok(workflow.nodes.some(node => node.name === 'Build Studio Failure'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publication'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Album Publishing'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publish Job'));
  const youtubeUpload = workflow.nodes.find(node => node.name === 'Upload Studio Album to YouTube');
  assert.equal(youtubeUpload?.parameters.regionCode, 'US');
  assert.equal(youtubeUpload?.parameters.categoryId, "={{ '10' }}");
});

test('unsupported publishing promises remain visibly disabled', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const panel = await read('components/StudioPublishingPanel.tsx');
  const workflow = await read('n8n-blueprints/E10-studio-album-publish.json');
  assert.match(fn, /Scheduled YouTube publishing is not enabled yet/);
  assert.match(panel, /Scheduling stays disabled/);
  assert.match(workflow, /Scheduling and custom-thumbnail upload are intentionally disabled/);
});

test('Studio video keeps the complete square cover inside the YouTube frame', async () => {
  const worker = await read('workers/video_worker.py');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(worker, /Never crop the approved artwork/);
  assert.match(worker, /force_original_aspect_ratio=decrease/);
  assert.match(worker, /gblur=sigma=24/);
  assert.match(worker, /overlay=\(W-w\)\/2:\(H-h\)\/2/);
  assert.match(worker, /RENDER_PROFILE = "studio-safe-fit-v1"/);
  assert.match(worker, /"render_profile": RENDER_PROFILE/);
  assert.doesNotMatch(worker, /f"\[0:v\]\{vf\}\[v\]"/);
  assert.match(page, /Re-render with safe fit/);
});

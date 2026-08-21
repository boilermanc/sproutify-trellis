import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('media generation schema is private, owner-aware, and provider-agnostic', async () => {
  const migration = await read('supabase/migrations/20260821170735_add_media_generation_foundation.sql');
  assert.match(migration, /CREATE TABLE public\.media_generation_jobs/);
  assert.match(migration, /provider TEXT NOT NULL DEFAULT 'runpod'/);
  assert.match(migration, /CREATE TABLE public\.media_generation_attempts/);
  assert.match(migration, /CREATE TABLE public\.media_usage_ledger/);
  assert.match(migration, /private\.can_access_media_project/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /'media-generation-assets',[\s\S]*false/);
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]{0,120}FOR ALL TO authenticated/);
});

test('LongCat catalog captures base, Avatar 1.5, weight, and GPU assumptions', async () => {
  const migration = await read('supabase/migrations/20260821170735_add_media_generation_foundation.sql');
  assert.match(migration, /'longcat-video-base'/);
  assert.match(migration, /"weights_gb":83\.3/);
  assert.match(migration, /'longcat-video-avatar-1\.5'/);
  assert.match(migration, /"weights_gb":74\.9/);
  assert.match(migration, /"recommended_gpu_count":2/);
  assert.match(migration, /"required_steps":8/);
});

test('RunPod provider implementation uses queue endpoints and keeps the key server-side', async () => {
  const provider = await read('supabase/functions/_shared/gpu-providers/runpod.ts');
  const fn = await read('supabase/functions/media-generation/index.ts');
  assert.match(provider, /\/run/);
  assert.match(provider, /\/status\//);
  assert.match(provider, /\/cancel\//);
  assert.match(provider, /JSON\.stringify\(\{ input, policy \}\)/);
  assert.match(fn, /Deno\.env\.get\("RUNPOD_API_KEY"\)/);
  assert.doesNotMatch(await read('services/mediaGenerationService.ts'), /RUNPOD_API_KEY|api\.runpod\.ai/);
});

test('GPU dispatch is fail-closed and bounded before a provider request', async () => {
  const fn = await read('supabase/functions/media-generation/index.ts');
  const migration = await read('supabase/migrations/20260821170735_add_media_generation_foundation.sql');
  assert.match(fn, /MEDIA_GENERATION_ENABLED/);
  assert.match(fn, /MEDIA_GENERATION_ALLOWED_ROLES/);
  assert.match(fn, /MEDIA_GENERATION_MAX_ACTIVE_PER_USER/);
  assert.match(fn, /MEDIA_GENERATION_MAX_DAILY_DISPATCHES_PER_USER/);
  assert.match(fn, /RUNPOD_EXECUTION_TIMEOUT_MS/);
  assert.match(fn, /executionTimeout: RUNPOD_EXECUTION_TIMEOUT_MS/);
  assert.match(fn, /ttl: RUNPOD_JOB_TTL_MS/);
  assert.match(fn, /Could not verify media generation usage limits; dispatch was blocked/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_media_jobs_one_active_per_user/);
});

test('jobs use signed object URLs and a versioned worker contract', async () => {
  const fn = await read('supabase/functions/media-generation/index.ts');
  assert.match(fn, /contract_version: "trellis\.media-generation\.v1"/);
  assert.match(fn, /createSignedUrl\(asset\.storage_path, 60 \* 60 \* 6\)/);
  assert.match(fn, /createSignedUploadUrl\(outputPath/);
  assert.match(fn, /reportedPath !== expectedPath/);
  assert.doesNotMatch(fn, /getPublicUrl/);
});

test('existing video tools are intentionally migrated, not deleted', async () => {
  const decisions = await read('docs/MEDIA_GENERATION_DECISIONS.md');
  assert.match(decisions, /Keep now/);
  assert.match(decisions, /Migrate into the new layer/);
  assert.match(decisions, /Do not replace/);
  assert.match(decisions, /Video Ad Lab/);
  assert.match(decisions, /Clip Studio/);
});

test('Trellis exposes a generation workspace without removing existing studios', async () => {
  const app = await read('App.tsx');
  const layout = await read('components/Layout.tsx');
  const page = await read('pages/MediaGeneration.tsx');
  assert.match(app, /case 'media-generation'/);
  assert.match(app, /case 'video-ad-lab'/);
  assert.match(app, /case 'clip-studio'/);
  assert.match(layout, /Media Generation/);
  assert.match(page, /Talking character/);
  assert.match(page, /Continue a video/);
  assert.match(page, /Queue & results/);
  assert.match(page, /cancelMediaGenerationJob/);
  assert.match(page, /retryMediaGenerationJob/);
});

test('LongCat worker pins upstream code and keeps giant weights on a volume', async () => {
  const dockerfile = await read('workers/longcat-serverless/Dockerfile');
  const handler = await read('workers/longcat-serverless/handler.py');
  const runner = await read('workers/longcat-serverless/longcat_job.py');
  assert.match(dockerfile, /LONGCAT_COMMIT=6b3f4b8582a8bc3f20f795735f5383716c4ba794/);
  assert.match(dockerfile, /LONGCAT_BASE_WEIGHTS=\/runpod-volume\/weights\/LongCat-Video/);
  assert.match(dockerfile, /apt-get install[^\n]+libsndfile1/);
  assert.match(dockerfile, /sed -i -e '\/\^libsndfile1==\/d' -e '\/\^tritonserverclient==\/d'/);
  assert.doesNotMatch(dockerfile, /huggingface-cli download/);
  assert.match(dockerfile, /COPY \. \.\//);
  assert.match(handler, /trellis\.media-generation\.v1/);
  assert.match(handler, /signed_upload_url/);
  assert.match(runner, /num_inference_steps=8/);
  assert.match(runner, /context_parallel_size=2/);
  assert.match(runner, /use_int8=True/);
  assert.match(runner, /generate_i2v/);
  assert.match(runner, /generate_vc/);
});

test('LongCat task adapters match the pinned upstream pipeline signatures', async () => {
  const runner = await read('workers/longcat-serverless/longcat_job.py');
  const requirements = await read('workers/longcat-serverless/requirements.txt');
  assert.match(runner, /generate_t2v\(height=480, width=832, \*\*common\)/);
  assert.match(runner, /generate_i2v\(image=load_image\(image_path\), resolution=resolution, \*\*common\)/);
  assert.match(runner, /generate_vc\(video=source, resolution=resolution,/);
  assert.doesNotMatch(runner, /common = dict\([^\n]*resolution=/);
  assert.match(runner, /dist\.destroy_process_group\(\)/);
  assert.match(requirements, /accelerate==0\.31\.0/);
});

test('Media Generation requires cost review and stores an editable timed-text plan', async () => {
  const page = await read('pages/MediaGeneration.tsx');
  const timeline = await read('components/media/TimedTextTimeline.tsx');
  const validation = await read('supabase/functions/_shared/media-generation.ts');
  assert.match(page, /Spend protection/);
  assert.match(page, /Review cost/);
  assert.match(page, /Confirm & generate/);
  assert.match(page, /finishing: \{ text_cues: textCues \}/);
  assert.match(page, /One worker maximum/);
  assert.match(page, /Tracked cost:/);
  assert.match(page, /VideoResultPreview/);
  assert.match(page, /cost_tracking_configured/);
  assert.match(timeline, /Flowing text/);
  assert.match(timeline, /word_reveal/);
  assert.match(timeline, /start_seconds/);
  assert.match(timeline, /end_seconds/);
  const preview = await read('components/media/VideoResultPreview.tsx');
  const styles = await read('index.css');
  assert.match(preview, /onTimeUpdate/);
  assert.match(preview, /Render final video creates a new MP4/);
  assert.match(styles, /@keyframes mediaTextSlideUp/);
  assert.match(validation, /sanitizeMediaText/);
  assert.match(validation, /\[REDACTED_CC\]/);
  assert.match(validation, /sanitizeJson\(body\.parameters/);
  assert.match(validation, /metadata: sanitizeJson/);
  const edge = await read('supabase/functions/media-generation/index.ts');
  assert.match(edge, /GPU cost tracking is not configured; dispatch was blocked/);
  assert.match(edge, /executionSeconds \* rate \* Number\(attempt\.gpu_count/);
  assert.match(edge, /get_configuration/);
});

test('post-generation finishing preserves the original and renders validated font choices on the existing worker', async () => {
  const migration = await read('supabase/migrations/20260821230515_add_media_finishing_jobs.sql');
  const edge = await read('supabase/functions/media-generation/index.ts');
  const library = await read('components/media/GeneratedMediaLibrary.tsx');
  const editor = await read('components/media/MediaFinishingEditor.tsx');
  const fonts = await read('components/media/mediaFonts.ts');
  const worker = await read('workers/clip-render-worker/worker.mjs');
  const composition = await read('workers/clip-render-worker/remotion/MediaFinishing.tsx');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.media_finishing_jobs/);
  assert.match(migration, /CHECK \(output_role IN \([^)]*'finished'/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.media_finishing_jobs FROM PUBLIC, anon, authenticated/);
  assert.match(edge, /body\.action === "create_finishing_job"/);
  assert.match(edge, /MEDIA_FONT_IDS/);
  assert.match(edge, /Create text finishes from the untouched original video/);
  assert.match(edge, /already has a finishing render in progress/);
  assert.match(library, /Edit text/);
  assert.match(library, /Finished version/);
  assert.match(editor, /Render final video/);
  assert.match(editor, /No LongCat charge/);
  assert.match(fonts, /Cormorant Garamond/);
  assert.match(fonts, /Bebas Neue/);
  assert.match(worker, /claimNextFinish/);
  assert.match(worker, /media-generation-assets/);
  assert.match(worker, /output_role: 'finished'/);
  assert.match(composition, /OffthreadVideo/);
  assert.match(composition, /word_reveal/);
});

test('Generated media library hands approved private video to the existing publishing queue', async () => {
  const page = await read('pages/MediaGeneration.tsx');
  const library = await read('components/media/GeneratedMediaLibrary.tsx');
  const service = await read('services/mediaGenerationService.ts');
  const edge = await read('supabase/functions/media-generation/index.ts');
  const migration = await read('supabase/migrations/20260821213000_link_media_generation_to_publishing.sql');
  const scheduler = JSON.parse(await read('n8n-blueprints/S1-scheduled-post-publisher.json'));
  const nodeNames = new Set(scheduler.nodes.map(node => node.name));

  assert.match(page, /Created media/);
  assert.match(page, /GeneratedMediaLibrary/);
  assert.match(library, /Every completed generation/);
  assert.match(library, /Send to Post Scheduler/);
  assert.match(library, /Instagram Reel/);
  assert.match(library, /TikTok video/);
  assert.match(library, /Facebook video remains disabled/);
  assert.match(service, /getMediaGenerationLibrary/);
  assert.match(service, /scheduleMediaGenerationOutput/);
  assert.match(edge, /body\.action === "list_library"/);
  assert.match(edge, /body\.action === "approve_output"/);
  assert.match(edge, /body\.action === "schedule_output"/);
  assert.match(edge, /MEDIA_PUBLISHING_HANDOFF_ENABLED/);
  assert.match(edge, /source_generation_output_id/);
  assert.match(migration, /source_media_asset_id/);
  assert.match(migration, /idx_ssp_created_by_idempotency/);
  assert.match(migration, /resolve_scheduled_generated_media/);
  assert.match(migration, /job\.created_by = scheduled\.created_by/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.resolve_scheduled_generated_media\(UUID\) FROM PUBLIC, anon, authenticated/);
  for (const name of ['Has Private Generated Media?', 'Fetch Generated Asset', 'Validate Generated Asset', 'Sign Generated Asset', 'Attach Generated Media URL']) {
    assert.equal(nodeNames.has(name), true, `missing scheduler node: ${name}`);
  }
  assert.match(JSON.stringify(scheduler), /expiresIn\\?"?: ?3600/);
  assert.equal(scheduler.connections['Drop Unclaimed Posts'].main[0][0].node, 'Has Private Generated Media?');
  assert.equal(scheduler.connections['Attach Generated Media URL'].main[0][0].node, 'Route by Platform');
  assert.match(JSON.stringify(scheduler), /rpc\/resolve_scheduled_generated_media/);
});

test('Media Generation gives first-time operators an in-product walkthrough', async () => {
  const page = await read('pages/MediaGeneration.tsx');
  const guide = await read('components/media/MediaGenerationGuide.tsx');

  assert.match(page, /MediaGenerationGuide/);
  assert.match(guide, /How to use Media Generation/);
  assert.match(guide, /Recommended first test/);
  assert.match(guide, /LongCat Base/);
  assert.match(guide, /Nothing is billed until/);
  assert.match(guide, /Text to video/);
  assert.match(guide, /Image to video/);
  assert.match(guide, /Talking character/);
  assert.match(guide, /Continue a video/);
  assert.match(guide, /Review and publish/);
  assert.match(guide, /does not replace them/);
});

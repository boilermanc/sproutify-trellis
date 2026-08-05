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
  assert.match(service, /RETRYABLE_STUDIO_READS = new Set\(\['list', 'tracks', 'list_cover_concepts', 'get_video_source', 'get_thumbnail'\]\)/);
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
  assert.match(fn, /source image for a titled cover and must be kept/);
  assert.doesNotMatch(fn, /remove\(\[asset\.storage_path\]\)/);
  assert.match(fn, /\["selected", "approved"\]\.includes/);
});

test('deleting a cover concept protects a drafted-but-unapproved titled cover, and approval verifies its source survives', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  // Regression: a concept could be deleted while its titled-cover draft was only
  // "selected" (not yet approved), then approval succeeded anyway, leaving the
  // approved cover pointing at an archived source image.
  assert.match(fn, /contains\("metadata_json", \{ role: "titled_cover", source_asset_id: asset\.id \}\)/);
  assert.doesNotMatch(fn, /contains\("metadata_json", \{ selection_status: "approved", source_asset_id: asset\.id \}\)/);
  assert.match(fn, /const sourceAssetId = selectedCover\.metadata_json\?\.source_asset_id/);
  assert.match(fn, /The clean source photo behind this titled cover was deleted/);
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

test('publishing draft picks the approved cover as the thumbnail, not just the newest one', async () => {
  // Regression: querying cover_art ordered by version desc grabs whatever
  // concept was generated most recently — including an unapproved alternate
  // created via "Create another concept" after the real cover was approved —
  // instead of the actual approved titled cover.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /const \{ data: cover \} = await db\.from\("studio_assets"\)\.select\("id"\)\.eq\("album_id", album\.id\)\.eq\("asset_type", "cover_art"\)\.eq\("status", "active"\)\.contains\("metadata_json", \{ selection_status: "approved" \}\)\.maybeSingle\(\);/);
});

test('scheduling stays disabled even though thumbnail upload is now wired', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const panel = await read('components/StudioPublishingPanel.tsx');
  const workflow = await read('n8n-blueprints/E10-studio-album-publish.json');
  assert.match(fn, /Scheduled YouTube publishing is not enabled yet/);
  assert.match(panel, /Scheduling stays disabled/);
  assert.match(workflow, /Scheduling stays disabled until verified end to end/);
});

test('a dedicated 16:9 thumbnail can be composed and is pushed to YouTube at publish', async () => {
  // YouTube's clickable thumbnail is a separate 16:9 image (title text, unlike
  // the clean video frame), set via a distinct thumbnails.set API call. It is
  // independent of both the video image and the square album cover.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  const composer = await read('components/StudioThumbnailComposer.tsx');
  const workflow = JSON.parse(await read('n8n-blueprints/E10-studio-album-publish.json'));
  assert.match(fn, /body\.action === "save_thumbnail_composite"/);
  assert.match(fn, /body\.action === "get_thumbnail"/);
  assert.match(fn, /asset_type: "thumbnail"/);
  assert.match(fn, /thumbnail_asset_id: thumbnail\?\.id \|\| cover\?\.id \|\| null/);
  assert.match(service, /saveStudioThumbnailComposite/);
  assert.match(service, /getStudioThumbnail/);
  assert.match(page, /StudioThumbnailComposer/);
  assert.match(composer, /const W = 1280/);
  assert.match(composer, /const H = 720/);
  // The title can be repositioned (3x3 anchor grid) and the placement persists.
  assert.match(composer, /Text position/);
  assert.match(composer, /setVPos\(v\); setHAlign\(h\)/);
  assert.match(composer, /text_v: vPos, text_h: hAlign/);
  assert.match(fn, /\["top", "middle", "bottom"\]\.includes/);
  assert.match(fn, /\["left", "center", "right"\]\.includes/);
  // The publish workflow downloads the thumbnail and pushes it via thumbnails.set,
  // and never blocks the release if it is missing.
  const download = workflow.nodes.find(n => n.name === 'Download Studio Thumbnail');
  const set = workflow.nodes.find(n => n.name === 'Set Studio Thumbnail');
  assert.ok(download && set, 'thumbnail nodes exist');
  assert.match(set.parameters.url, /thumbnails\/set\?videoId=/);
  assert.equal(download.onError, 'continueRegularOutput');
  assert.equal(set.onError, 'continueRegularOutput');
  assert.equal(workflow.connections['Extract Studio Video ID'].main[0][0].node, 'Download Studio Thumbnail');
  assert.equal(workflow.connections['Set Studio Thumbnail'].main[0][0].node, 'Mark Studio Publication Live');
});

test('Studio video renders with no separate artwork-approval step', async () => {
  // Regression: an earlier design required a separate "16:9 video artwork"
  // asset (an AI outpaint call, or a compose-and-approve step) before a video
  // could render at all. Episodes never had this — buildVideo() just fires
  // whatever cover URL is approved straight at the worker. Studio Albums now
  // matches that: no separate artwork asset to approve, no extra click.
  const worker = await read('workers/video_worker.py');
  const page = await read('pages/StudioAlbums.tsx');
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.doesNotMatch(fn, /generate_video_artwork/);
  assert.doesNotMatch(fn, /use_cover_as_video_artwork/);
  assert.doesNotMatch(fn, /save_video_artwork_composite/);
  assert.doesNotMatch(fn, /approve_video_artwork/);
  assert.doesNotMatch(fn, /list_video_artwork/);
  assert.match(fn, /artwork_layout: "full_bleed_16x9"/);
  assert.match(fn, /eq\("asset_type", "cover_art"\)\.eq\("status", "active"\)\.contains\("metadata_json", \{ selection_status: "approved" \}\)/);
  assert.match(fn, /Approve the cover before rendering the final video\./);
  assert.match(fn, /This render predates artwork layout tracking\. Render again before approving\./);
  assert.match(worker, /artwork_layout"\) not in \("cover_safe_fit", "full_bleed_16x9"\)/);
  assert.match(worker, /force_original_aspect_ratio=increase/);
  assert.match(worker, /framed_cover = os\.path\.join\(tmp, "framed-cover\.png"\)/);
  assert.doesNotMatch(page, /StudioVideoArtworkComposer/);
  assert.doesNotMatch(page, /Step 6a/);
  assert.match(page, /Your widescreen video image/);
  assert.match(page, /Render final video/);
});

test('video renders from a native 16:9 text-free companion photo, not a crop of the square typography cover', async () => {
  // Root-cause fix: cropping a square cover that has title text burned near its
  // edges either clips the text or throws away ~44% of the photo. Episodes never
  // hits this because its cover_art is generated natively at 16:9 with no text
  // at all. Studio Albums now generates the same kind of clean, native 16:9
  // companion photo (same scene/style/direction, text-free) and reuses it on
  // every re-render for that same cover.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /async function generateStudioVideoSource\(db: any, album: any, sourceConcept: any\)/);
  assert.match(fn, /buildCoverPrompt\("Widescreen 16:9"/);
  assert.match(fn, /aspectRatio: "16:9"/);
  assert.match(fn, /no title, no words/);
  assert.doesNotMatch(fn, /Recompose and outpaint/);
  assert.match(fn, /role: "video_source", source_asset_id: sourceConcept\.id, aspect_ratio: "16:9"/);
  assert.match(fn, /const sourceConceptId = approvedCover\.metadata_json\?\.source_asset_id \|\| approvedCover\.id/);
  assert.match(fn, /The clean source photo behind the approved cover is unavailable\./);
  assert.match(fn, /contains\("metadata_json", \{ role: "video_source", source_asset_id: sourceConceptId \}\)/);
  assert.match(fn, /if \(!videoSource\) videoSource = await generateStudioVideoSource\(db, album, sourceConcept\)/);
  assert.match(fn, /style_prompt: stylePrompt/);
});

test('the widescreen video image is generated, previewed, and can be regenerated before rendering', async () => {
  // The video-step card must show the ACTUAL 16:9 image that will render, not
  // the square cover CSS-cropped into a 16:9 box (which looked like the top and
  // bottom were chopped off). It auto-loads/generates on arrival and offers a
  // regenerate for a different take, with only one active at a time.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /body\.action === "get_video_source"/);
  assert.match(fn, /body\.action === "generate_video_source"/);
  assert.match(fn, /async function activeVideoSource/);
  assert.match(fn, /Only one video-source stays active at a time/);
  assert.match(service, /getStudioVideoSource/);
  assert.match(service, /regenerateStudioVideoSource/);
  assert.match(service, /'get_video_source', 'get_thumbnail'\]\)/);
  assert.match(page, /Your widescreen video image/);
  assert.match(page, /Nothing is cropped/);
  assert.match(page, /regenerateVideoImage/);
  assert.match(page, /alt="Widescreen video image"/);
  assert.doesNotMatch(page, /alt="Approved album cover" className="mt-4 aspect-video/);
});

test('cover typography has a text color picker and font selector, and no video crop guide', async () => {
  const composer = await read('components/StudioCoverComposer.tsx');
  const service = await read('services/studioAlbumsService.ts');
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const page = await read('pages/StudioAlbums.tsx');
  const html = await read('index.html');
  assert.match(composer, /type="color"/);
  assert.match(composer, /TREATMENT_DEFAULT_COLOR/);
  assert.match(composer, /FONT_OPTIONS/);
  assert.match(composer, /TREATMENT_DEFAULT_FONT/);
  assert.match(composer, /Playfair Display/);
  assert.doesNotMatch(composer, /crop guide/i);
  assert.doesNotMatch(composer, /VIDEO_CROP_FRACTION/);
  assert.match(service, /title_color\?: string/);
  assert.match(service, /title_font\?: string/);
  assert.match(fn, /title_color: \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test/);
  assert.match(fn, /VALID_COVER_FONTS\.has/);
  assert.match(page, /defaultTitleColor=\{selectedCoverConcept\.metadata_json\?\.typography\?\.title_color\}/);
  assert.match(page, /defaultTitleFont=\{selectedCoverConcept\.metadata_json\?\.typography\?\.title_font\}/);
  assert.match(html, /Playfair\+Display/);
});

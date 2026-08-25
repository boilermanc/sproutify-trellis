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

test('Studio limits active Lyria workers and automatically recovers stale track jobs', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /const MAX_CONCURRENT_STUDIO_TRACKS = 3/);
  assert.match(fn, /const STALE_STUDIO_TRACK_MS = 25 \* 60 \* 1000/);
  assert.match(fn, /async function recoverStudioTrackQueue/);
  assert.match(fn, /track\.status === "generating" && new Date\(track\.updated_at\)\.getTime\(\) < cutoff/);
  assert.match(fn, /const availableSlots = Math\.max\(0, MAX_CONCURRENT_STUDIO_TRACKS - active\.length\)/);
  assert.match(fn, /queueStudioTrackGeneration\(db, album, user\.id, track, false\)/);
  assert.match(fn, /await recoverStudioTrackQueue\(db, album\.id\)/);
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
  assert.match(service, /RETRYABLE_STUDIO_READS = new Set\(\['list', 'tracks', 'list_cover_concepts', 'get_video_source', 'list_video_sources', 'get_thumbnail', 'list_publications'\]\)/);
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

test('Studio image options include Cinematic Architectural Minimalism for Quiet Intelligence releases', async () => {
  const constants = await read('constants.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(constants, /id: 'cinematic_architectural_minimalism'/);
  assert.match(constants, /name: 'Cinematic Architectural Minimalism'/);
  assert.match(constants, /Monumental spaces, sculptural materials, warm shadows and quiet luxury\./);
  assert.match(constants, /expansive negative space/);
  assert.match(constants, /No bright colors, busy decor/);
  assert.match(constants, /No people by default; if scale is essential, use only one tiny distant figure/);
  assert.match(page, /EPISODE_ART_STYLES\.map\(style => <option/);
});

test('Studio image options include Cinematic Vintage Noir and persist paired mood selections', async () => {
  const constants = await read('constants.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(constants, /id: 'cinematic_vintage_noir'/);
  assert.match(constants, /name: 'Cinematic Vintage Noir'/);
  assert.match(constants, /rain-streaked window/);
  assert.match(constants, /No modern nightclub, neon or cyberpunk colors/);
  assert.match(constants, /visible weapons/);
  assert.match(page, /paired_art_style_id: preset\.paired_art_style_id/);
  assert.match(page, /setCoverStyleId\(pairedArtStyleId\)/);
});

test('Studio image options include Sunlit Lifestyle Editorial for Morning Flow', async () => {
  const constants = await read('constants.ts');
  assert.match(constants, /id: 'sunlit_lifestyle_editorial'/);
  assert.match(constants, /name: 'Sunlit Lifestyle Editorial'/);
  assert.match(constants, /Warm morning light, relaxed luxury and clean modern living\./);
  assert.match(constants, /one or two purposeful lifestyle details/);
  assert.match(constants, /No staged stock-photo smiles/);
  assert.match(constants, /generous negative space for later typography or product overlays/);
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
  assert.match(fn, /!\["ready", "failed"\]\.includes\(publication\.status\)/);
  assert.match(panel, /Submit .* to YouTube with/);
  assert.match(panel, /New releases default to private/);
  assert.ok(workflow.nodes.some(node => node.name === 'Build Studio Failure'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publication'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Album Publishing'));
  assert.ok(workflow.nodes.some(node => node.name === 'Fail Studio Publish Job'));
  const youtubeUpload = workflow.nodes.find(node => node.name === 'Upload Studio Album to YouTube');
  assert.equal(youtubeUpload?.type, 'n8n-nodes-base.executeWorkflow');
  assert.deepEqual(youtubeUpload?.parameters.workflowId, {
    __rl: true,
    value: 'REPLACE_WITH_E11_WORKFLOW_ID',
    mode: 'id',
  });
  assert.ok(workflow.nodes.some(node => node.name === 'Prepare Studio Account Upload'));
  assert.ok(!workflow.nodes.some(node => node.name === 'Download Private Studio Video'));
});

test('Studio cover generation uses the current native Gemini image API', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /const IMAGE_MODEL = configuredImageModel\.startsWith\("imagen-"\) \? "gemini-3\.1-flash-image"/);
  assert.match(fn, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{IMAGE_MODEL\}:generateContent/);
  assert.match(fn, /generationConfig: \{ responseModalities: \["IMAGE"\], imageConfig: \{ aspectRatio \} \}/);
  assert.match(fn, /candidates\?\.\[0\]\?\.content\?\.parts\?\.find/);
  assert.doesNotMatch(fn, /models\/\$\{IMAGE_MODEL\}:predict/);
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
  assert.match(page, /Choose your widescreen video image/);
  assert.match(page, /Render final video/);
});

test('oversized Studio renders use Supabase resumable storage uploads', async () => {
  const worker = await read('workers/video_worker.py');
  const requirements = await read('workers/requirements.txt');
  assert.match(requirements, /tuspy==1\.1\.0/);
  assert.match(worker, /\.storage\.supabase\.co/);
  assert.match(worker, /storage\/v1\/upload\/resumable/);
  assert.match(worker, /TUS_CHUNK_SIZE = 6 \* 1024 \* 1024/);
  assert.match(worker, /"bucketName": bucket/);
  assert.match(worker, /"objectName": path_in_bucket/);
  assert.match(worker, /if size_mb > MAX_STANDARD_UPLOAD_MB:[\s\S]*?_upload_resumable/);
  assert.doesNotMatch(worker, /above the configured standard upload limit/);
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
  assert.match(fn, /role: "video_source", selection_status: "selected", source_asset_id: sourceConcept\.id, aspect_ratio: "16:9"/);
  assert.match(fn, /const sourceConceptId = approvedCover\.metadata_json\?\.source_asset_id \|\| approvedCover\.id/);
  assert.match(fn, /The clean source photo behind the approved cover is unavailable\./);
  assert.match(fn, /contains\("metadata_json", \{ role: "video_source", source_asset_id: sourceConceptId \}\)/);
  assert.match(fn, /if \(!videoSource\) videoSource = await generateStudioVideoSource\(db, album, sourceConcept\)/);
  assert.match(fn, /style_prompt: stylePrompt/);
});

test('the widescreen video image is a pick-from-many gallery, not a crop of the square cover', async () => {
  // The video-step card shows the ACTUAL 16:9 images that will render (not the
  // square cover CSS-cropped into a 16:9 box). You can generate several takes,
  // pick the one used in the video, and remove takes you do not want. The newest
  // take is auto-selected; exactly one is selected at a time.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /body\.action === "list_video_sources"/);
  assert.match(fn, /body\.action === "get_video_source"/);
  assert.match(fn, /body\.action === "generate_video_source"/);
  assert.match(fn, /body\.action === "select_video_source"/);
  assert.match(fn, /body\.action === "delete_video_source"/);
  assert.match(fn, /async function selectedVideoSource/);
  assert.match(fn, /async function deselectVideoSources/);
  assert.match(fn, /store PNG bytes as a new video_source take that joins the gallery/);
  assert.match(fn, /selection_status: "selected"/);
  assert.match(service, /getStudioVideoSources/);
  assert.match(service, /selectStudioVideoSource/);
  assert.match(service, /deleteStudioVideoSource/);
  assert.match(service, /'get_video_source', 'list_video_sources', 'get_thumbnail', 'list_publications'\]\)/);
  assert.match(page, /Choose your widescreen video image/);
  assert.match(page, /Fresh take/);
  assert.match(page, /chooseVideoImage/);
  assert.match(page, /requestDeleteVideoImage/);
  assert.match(page, /Selected · in the video/);
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

test('the title can optionally be burned onto the video by rendering from the thumbnail', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /if \(body\.use_thumbnail === true\)/);
  assert.match(fn, /let renderSource = videoSource/);
  assert.match(fn, /show_title_on_video: showTitleOnVideo/);
  assert.match(fn, /createSignedUrl\(renderSource\.storage_path/);
  assert.match(service, /useThumbnail = false/);
  assert.match(service, /use_thumbnail: useThumbnail/);
  assert.match(page, /Show the title on the video too/);
  assert.match(page, /showTitleOnVideo && !!thumbnail/);
});

test('publishing metadata is AI-written in the rich YouTube format', async () => {
  // A genre summary line, evocative paragraphs, the auto chapters (baked into
  // the description with a 0:00 first marker so YouTube builds chapters), an
  // "Ideal for" bullet list, and a hashtag block — falling back to the plain
  // description if the AI call is unavailable.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const panel = await read('components/StudioPublishingPanel.tsx');
  assert.match(fn, /async function generateAlbumMetadata/);
  assert.match(fn, /genre_summary/);
  assert.match(fn, /☀️ Ideal for:/);
  assert.match(fn, /const hashtagLine = meta\?\.hashtags\?\.length/);
  assert.match(fn, /const meta = await generateAlbumMetadata\(db, album, tracks \|\| \[\]\)/);
  assert.match(fn, /meta\?\.description \|\| album\.short_description/);
  // Chapters go in the description, so the publish webhook must not re-append them.
  assert.match(fn, /tags: publication\.tags, chapters: \[\] \} \}\) \}\);/);
  assert.match(panel, /Regenerate/);
});

test('tracks can be reordered before the master is built', async () => {
  // The stitched master bakes in the running order, so reordering is offered
  // only while the master is not_started/failed, and renumbers in two phases to
  // respect the UNIQUE(album_id, track_number) constraint.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /body\.action === "reorder_tracks"/);
  assert.match(fn, /Rebuild the master to change the running order/);
  assert.match(fn, /track_number: 100000 \+ index \+ 1/);
  assert.match(fn, /The reordered list must include every track exactly once/);
  assert.match(service, /reorderStudioTracks/);
  assert.match(page, /const reorderAllowed =/);
  assert.match(page, /\['not_started', 'failed'\]\.includes\(selected\.master_status\)/);
  assert.match(page, /moveTrack\(trackIndex, 'up'\)/);
  assert.match(page, /moveTrack\(trackIndex, 'down'\)/);
});

test('the approved cover can be extended to 16:9 as a video image take', async () => {
  // For users who want the video image to BE their cover (not a different
  // same-scene photo), outpaint the actual approved cover into 16:9 — kept as an
  // opt-in alongside the default fresh-take generation, joining the same gallery.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /async function extendCoverToVideoSource/);
  assert.match(fn, /body\.action === "extend_cover_video_source"/);
  assert.match(fn, /Recompose and outpaint the supplied square/);
  assert.match(fn, /method: "cover_extend"/);
  assert.match(fn, /async function storeVideoSource/);
  assert.match(service, /extendCoverToStudioVideoSource/);
  assert.match(page, /Extend the cover/);
  assert.match(page, /extendCoverForVideoImage/);
});

test('a video image can be uploaded, and the redundant post-approval cover gallery is gone', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  assert.match(fn, /body\.action === "upload_video_source"/);
  assert.match(fn, /The uploaded image must be a PNG/);
  assert.match(fn, /method: "uploaded"/);
  assert.match(service, /uploadStudioVideoSource/);
  assert.match(page, /uploadVideoImage/);
  assert.match(page, /type="file" accept="image\/\*"/);
  // The confusing "Artwork is locked for Visual Production" section is removed.
  assert.doesNotMatch(page, /Artwork is locked for Visual Production/);
});

test('publishing resolves the CURRENT active video and thumbnail, not stale draft ids', async () => {
  // Regression: the publication captured video_asset_id at prepare time; a later
  // re-render archived that asset, so submit looked up an archived id, found
  // nothing, and 400'd with "approved video asset is unavailable". Submit must
  // resolve the newest active final_video/thumbnail for the album instead.
  const fn = await read('supabase/functions/studio-albums/index.ts');
  assert.match(fn, /Resolve the CURRENT active video and thumbnail, not the ids captured/);
  assert.match(fn, /const \{ data: video \} = await db\.from\("studio_assets"\)\.select\("\*"\)\.eq\("album_id", album\.id\)\.eq\("asset_type", "final_video"\)\.eq\("status", "active"\)\.order\("version", \{ ascending: false \}\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(fn, /\.eq\("id", publication\.video_asset_id\)/);
});

test('the app tracks the YouTube release: polls while submitting, shows live/failed, retries', async () => {
  const page = await read('pages/StudioAlbums.tsx');
  const panel = await read('components/StudioPublishingPanel.tsx');
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const workflow = await read('n8n-blueprints/E10-studio-album-publish.json');
  // Poll while a submission is in flight so live/failed lands without a reload.
  assert.match(page, /const hasActivePublish = publication\?\.status === 'submitting'/);
  assert.match(page, /!hasActiveVideo && !hasActivePublish/);
  // Surface the live release (link) and the in-flight state.
  assert.match(panel, /Live on YouTube/);
  assert.match(panel, /Watch on YouTube/);
  assert.match(panel, /Publishing to YouTube/);
  // A failed publication can be retried.
  assert.match(panel, /Retry submit to YouTube/);
  assert.match(fn, /!\["ready", "failed"\]\.includes\(publication\.status\)/);
  // The failure node no longer mislabels the album description as the error.
  assert.doesNotMatch(workflow, /e\.message \|\| e\.error\?\.message \|\| e\.description/);
});

test('live releases are listed and the album title is editable', async () => {
  const fn = await read('supabase/functions/studio-albums/index.ts');
  const service = await read('services/studioAlbumsService.ts');
  const page = await read('pages/StudioAlbums.tsx');
  // Releases listing.
  assert.match(fn, /body\.action === "list_publications"/);
  assert.match(fn, /\.eq\("status", "live"\)\.order\("published_at"/);
  assert.match(service, /getStudioReleases/);
  assert.match(page, /Live on YouTube/);
  assert.match(page, /img\.youtube\.com\/vi\/\$\{release\.external_id\}/);
  // Editable album title.
  assert.match(fn, /body\.action === "rename_album"/);
  assert.match(fn, /The album title cannot be empty/);
  assert.match(service, /renameStudioAlbum/);
  assert.match(page, /const saveTitle = async/);
  assert.match(page, /Edit album title/);
});

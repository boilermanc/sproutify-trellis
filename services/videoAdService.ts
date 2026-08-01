import { VideoAdConfig, VideoAdJob, TextOverlayConfig } from '../types';
import { VIDEO_AD_WEBHOOK, STATIC_AD_WEBHOOK, CAROUSEL_AD_WEBHOOK, VIDEO_AD_RENDER_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';

// ─── Video Ad Lab Service ──────────────────────────────────────────
// Job submission goes to n8n via webhook (fire-and-forget).
// Job polling, listing, and cancellation use the Hub Supabase client
// since video_ad_jobs is orchestration data stored on Hub.
// ────────────────────────────────────────────────────────────────────

// ─── 1. submitVideoAdJob ───────────────────────────────────────────
// Generate a job_id client-side, fire the webhook (don't await the
// response — n8n processing takes minutes, Cloudflare will 524), and
// return the job_id immediately so the poller can start tracking it.
// n8n must use the provided job_id as the row's id in video_ad_jobs.
//
// `script`/`aspect_ratio`/`setting` are optional extras layered on top of
// VideoAdConfig (not part of that type in types.ts) so the caller can pass
// the user-edited script and visual settings through without us touching
// the shared type file.
export async function submitVideoAdJob(
  config: VideoAdConfig & { script?: string; aspect_ratio?: string; setting?: string },
): Promise<{ job_id: string }> {
  const job_id = crypto.randomUUID();

  // Fire-and-forget — don't await. n8n receives and processes the
  // request even if the browser can't read the response (CORS / 524).
  fetch(VIDEO_AD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id,
      branch: config.branch,
      product_description: config.product_description,
      target_segment: config.target_segment,
      tone: config.tone,
      cta: config.cta,
      actor_style: config.actor_style,
      actor_gender: config.actor_gender,
      voice_style: config.voice_style,
      video_duration: config.video_duration,
      pipeline: config.pipeline,
      platform: config.platform,
      script: config.script,
      aspect_ratio: config.aspect_ratio,
      setting: config.setting,
    }),
  }).catch(() => {
    // Expected — Cloudflare 524 timeout or CORS block on the response.
    // The request still reaches n8n and the job will appear in Supabase.
    console.log('[videoAd] Webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
}

// ─── 2. pollVideoAdJob ────────────────────────────────────────────
// Fetch a single job by ID from Hub Supabase.
// n8n's Supabase node writes JSONB columns by stringifying them, which
// PostgREST stores as a JSON *string* rather than a native array/object.
// Verified on live rows: jsonb_typeof(media_urls) = 'string'. Normalize on
// read so callers can always trust the shape, whoever wrote the row.
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function normalizeJob<T extends VideoAdJob | null>(job: T): T {
  if (!job) return job;
  return {
    ...job,
    media_urls: parseJsonbField<string[]>(job.media_urls, []),
    request_payload: parseJsonbField<Record<string, any> | undefined>(job.request_payload, undefined),
  };
}

export async function pollVideoAdJob(
  jobId: string,
): Promise<VideoAdJob | null> {
  const { data, error } = await supabase
    .from('video_ad_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to poll video ad job ${jobId}: ${error.message}`);
  }

  return normalizeJob(data as VideoAdJob | null);
}

// ─── 3. getVideoAdJobs ───────────────────────────────────────────
// List recent jobs from Hub Supabase, optionally filtered by branch.
export async function getVideoAdJobs(
  branch?: string,
  limit: number = 50,
): Promise<VideoAdJob[]> {
  let query = supabase
    .from('video_ad_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (branch) {
    query = query.eq('branch', branch);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list video ad jobs: ${error.message}`);
  }

  return ((data as VideoAdJob[]) ?? []).map(normalizeJob);
}

// ─── 4. cancelVideoAdJob ─────────────────────────────────────────
// PATCH the job status to 'cancelled' on Hub Supabase.
export async function cancelVideoAdJob(
  jobId: string,
): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to cancel video ad job ${jobId}: ${error.message}`);
  }
}

// ─── Creative Studio: Static + Carousel formats ──────────────────────
// Same client-generated job_id + fire-and-forget pattern as
// submitVideoAdJob above. n8n uses the provided job_id as the row's id
// in video_ad_jobs (format='static' | 'carousel').

export interface StaticAdConfig {
  branch: string;
  message: string;
  target_segment: string;
  platform: string;
  aspect_ratio: string;
  setting: string;
  style_notes: string;
  // Optional real photo: 'edit' keeps the photo and renders the headline onto it,
  // 'inspire' generates a new image guided by the photo's setting/mood/composition.
  reference_image_url?: string;
  reference_mode?: 'edit' | 'inspire';
  // 'background' = a text-led canvas (devotional/quote posts): atmospheric, no
  // subject, no people. 'photo' = a normal ad photograph with a subject.
  image_style?: 'photo' | 'background';
  // Why this job exists. 'card_background' = Card Studio requested this image
  // as an editorial card's backdrop — it is consumed there directly, so
  // Creative Studio must NOT surface it for review/approval. Rides into
  // request_payload via the webhook body; no blueprint change needed.
  purpose?: string;
}

export interface CarouselAdConfig {
  branch: string;
  topic: string;
  slide_count: number;
  target_segment: string;
  platform: string;
  aspect_ratio: string;
  style_notes: string;
}

// ─── 5. submitStaticAdJob ────────────────────────────────────────
export async function submitStaticAdJob(
  config: StaticAdConfig,
): Promise<{ job_id: string }> {
  const job_id = crypto.randomUUID();

  fetch(STATIC_AD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id,
      branch: config.branch,
      message: config.message,
      target_segment: config.target_segment,
      platform: config.platform,
      aspect_ratio: config.aspect_ratio,
      setting: config.setting,
      style_notes: config.style_notes,
      reference_image_url: config.reference_image_url || '',
      reference_mode: config.reference_mode || 'inspire',
      image_style: config.image_style || 'photo',
      purpose: config.purpose || '',
    }),
  }).catch(() => {
    // Expected — Cloudflare 524 timeout or CORS block on the response.
    // The request still reaches n8n and the job will appear in Supabase.
    console.log('[videoAd] Static ad webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
}

// ─── 5b. submitStaticAdBatch ─────────────────────────────────────
// Queues a whole batch of static ad jobs in one go (e.g. a week/month of
// daily social images) instead of the caller submitting them one at a time.
// Reuses submitStaticAdJob per config — same client-generated job_id +
// fire-and-forget webhook pattern.
//
// IMPORTANT: calls are staggered (~400ms apart by default) rather than all
// fired at once. Each job kicks off its own Gemini text + image generation
// pass in n8n; a dozen+ simultaneous submissions can trip provider rate
// limits (Gemini/image API 429s), which would fail jobs that had nothing
// wrong with their config. A small stagger smooths the burst without making
// the caller wait meaningfully — n8n processes each job asynchronously
// regardless, so this only delays when the *request* goes out, not when
// results come back.
export async function submitStaticAdBatch(
  configs: StaticAdConfig[],
  opts?: { staggerMs?: number },
): Promise<{ job_ids: string[] }> {
  const staggerMs = opts?.staggerMs ?? 400;
  const job_ids: string[] = [];

  for (let i = 0; i < configs.length; i++) {
    if (i > 0 && staggerMs > 0) {
      await new Promise(resolve => setTimeout(resolve, staggerMs));
    }
    const { job_id } = await submitStaticAdJob(configs[i]);
    job_ids.push(job_id);
  }

  return { job_ids };
}

// ─── 6. submitCarouselJob ────────────────────────────────────────
export async function submitCarouselJob(
  config: CarouselAdConfig,
): Promise<{ job_id: string }> {
  const job_id = crypto.randomUUID();

  fetch(CAROUSEL_AD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id,
      branch: config.branch,
      topic: config.topic,
      slide_count: config.slide_count,
      target_segment: config.target_segment,
      platform: config.platform,
      aspect_ratio: config.aspect_ratio,
      style_notes: config.style_notes,
    }),
  }).catch(() => {
    // Expected — Cloudflare 524 timeout or CORS block on the response.
    // The request still reaches n8n and the job will appear in Supabase.
    console.log('[videoAd] Carousel webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
}

// ─── 7. approveJob ───────────────────────────────────────────────
// Marks a static/carousel job (currently 'awaiting_approval') as
// approved+complete. There's no further render step for these formats —
// the generated frame(s) ARE the deliverable, so approval just finalizes
// the job.
export async function approveJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ status: 'completed', frame_approved_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to approve video ad job ${jobId}: ${error.message}`);
  }
}

// ─── 8. approveAndRenderVideo ─────────────────────────────────────
// For format='video' jobs sitting in 'awaiting_approval' (frame approved,
// ready to animate): flip status to 'rendering' on Hub Supabase, then
// fire-and-forget the render webhook so n8n picks up the job and finishes
// the video pipeline.
export async function approveAndRenderVideo(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ status: 'rendering' })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to approve video ad job ${jobId}: ${error.message}`);
  }

  fetch(VIDEO_AD_RENDER_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(() => {
    // Expected — Cloudflare 524 timeout or CORS block on the response.
    // The request still reaches n8n and the job will appear in Supabase.
    console.log('[videoAd] Render webhook fire-and-forget completed (response unreadable, expected)');
  });
}

// ─── 9. regenerateJob ─────────────────────────────────────────────
// "Not quite — try again." Re-runs a job from the exact inputs it was
// created with (stored on the row by n8n as request_payload), optionally
// with a note describing what should change. This creates a NEW job so the
// original stays intact for comparison; the two are linked by revision_of.
export async function regenerateJob(
  job: VideoAdJob,
  revisionNotes?: string,
): Promise<{ job_id: string }> {
  const payload = job.request_payload;
  if (!payload) {
    throw new Error(
      'This job was created before revisions were supported, so its original inputs were not saved. Create a new one instead.',
    );
  }

  const format = job.format || 'video';
  const webhook = format === 'static' ? STATIC_AD_WEBHOOK
    : format === 'carousel' ? CAROUSEL_AD_WEBHOOK
    : VIDEO_AD_WEBHOOK;

  const job_id = crypto.randomUUID();

  fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      job_id,
      revision_of: job.id,
      revision_notes: revisionNotes || '',
    }),
  }).catch(() => {
    console.log('[videoAd] Regenerate webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
}

// ─── 9b. Text overlay persistence ─────────────────────────────────
// Generated images are kept clean (no AI-drawn text); the headline is
// composited on top in the real brand font. The editable layer config
// lives on the job so it can be reopened and adjusted, and the flattened
// PNG is what actually gets published and downloaded.
export async function saveOverlayConfig(
  jobId: string,
  config: TextOverlayConfig,
): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ overlay_config: config })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to save overlay for job ${jobId}: ${error.message}`);
  }
}

// Uploads the flattened image and records it on the job. Returns the public URL.
export async function saveComposite(
  jobId: string,
  blob: Blob,
  config?: TextOverlayConfig,
): Promise<string> {
  const path = `static-ads/${jobId}/composite-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('episode-assets')
    .upload(path, blob, { contentType: 'image/png', upsert: false });

  if (uploadError) {
    throw new Error(`Failed to upload composite: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from('episode-assets').getPublicUrl(path);
  const composite_url = data.publicUrl;

  const update: Record<string, any> = { composite_url };
  if (config) update.overlay_config = config;

  const { error } = await supabase
    .from('video_ad_jobs')
    .update(update)
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to record composite on job ${jobId}: ${error.message}`);
  }

  return composite_url;
}

// What should actually be published/downloaded: the flattened image if one
// exists, else the raw generated frame.
export function publishableImageUrl(job: VideoAdJob): string {
  return job.composite_url || job.frame_url || job.media_urls?.[0] || '';
}

// ─── 10. discardJob ───────────────────────────────────────────────
// Rejecting a creative at review. Distinct from cancelling an in-flight
// job: the work is done, we just don't want it.
export async function discardJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to discard job ${jobId}: ${error.message}`);
  }
}

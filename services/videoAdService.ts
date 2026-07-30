import { VideoAdConfig, VideoAdJob } from '../types';
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
    }),
  }).catch(() => {
    // Expected — Cloudflare 524 timeout or CORS block on the response.
    // The request still reaches n8n and the job will appear in Supabase.
    console.log('[videoAd] Static ad webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
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

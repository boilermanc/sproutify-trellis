import { VideoAdConfig, VideoAdJob } from '../types';
import { VIDEO_AD_WEBHOOK } from '../constants';
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
export async function submitVideoAdJob(
  config: VideoAdConfig,
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

  return data as VideoAdJob | null;
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

  return (data as VideoAdJob[]) ?? [];
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

import { VideoAdConfig, VideoAdJob } from '../types';
import { VIDEO_AD_WEBHOOK } from '../constants';

// ─── Video Ad Lab Service ──────────────────────────────────────────
// Communicates with n8n (job submission) and ATL Supabase REST API
// (job polling, listing, cancellation). Uses plain fetch throughout.
//
// Spoke credentials are passed in at call time — they come from the
// SpokeConnection objects stored in the app, not from env vars.
// ────────────────────────────────────────────────────────────────────

export interface SpokeCredentials {
  url: string;
  key: string;
}

function supabaseHeaders(key: string): Record<string, string> {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

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
// Fetch a single job by ID from the Supabase REST API.
export async function pollVideoAdJob(
  jobId: string,
  creds?: SpokeCredentials,
): Promise<VideoAdJob | null> {
  if (!creds?.url || !creds?.key) return null;
  try {
    const response = await fetch(
      `${creds.url}/rest/v1/video_ad_jobs?id=eq.${jobId}&select=*`,
      { headers: supabaseHeaders(creds.key) },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase poll error (${response.status}): ${text}`);
    }

    const rows: VideoAdJob[] = await response.json();
    return rows[0] ?? null;
  } catch (err: any) {
    throw new Error(`Failed to poll video ad job ${jobId}: ${err.message}`);
  }
}

// ─── 3. getVideoAdJobs ───────────────────────────────────────────
// List recent jobs, optionally filtered by branch.
export async function getVideoAdJobs(
  creds?: SpokeCredentials,
  branch?: string,
  limit: number = 20,
): Promise<VideoAdJob[]> {
  if (!creds?.url || !creds?.key) return [];
  try {
    let url = `${creds.url}/rest/v1/video_ad_jobs?select=*&order=created_at.desc&limit=${limit}`;
    if (branch) {
      url += `&branch=eq.${branch}`;
    }

    const response = await fetch(url, { headers: supabaseHeaders(creds.key) });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase list error (${response.status}): ${text}`);
    }

    return await response.json();
  } catch (err: any) {
    throw new Error(`Failed to list video ad jobs: ${err.message}`);
  }
}

// ─── 4. cancelVideoAdJob ─────────────────────────────────────────
// PATCH the job status to 'cancelled'.
export async function cancelVideoAdJob(
  jobId: string,
  creds?: SpokeCredentials,
): Promise<void> {
  if (!creds?.url || !creds?.key) return;
  try {
    const response = await fetch(
      `${creds.url}/rest/v1/video_ad_jobs?id=eq.${jobId}`,
      {
        method: 'PATCH',
        headers: {
          ...supabaseHeaders(creds.key),
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase cancel error (${response.status}): ${text}`);
    }
  } catch (err: any) {
    throw new Error(`Failed to cancel video ad job ${jobId}: ${err.message}`);
  }
}

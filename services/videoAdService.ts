import { VideoAdConfig, VideoAdJob } from '../types';
import { VIDEO_AD_WEBHOOK } from '../constants';

// ─── Video Ad Lab Service ──────────────────────────────────────────
// Communicates with n8n (job submission) and ATL Supabase REST API
// (job polling, listing, cancellation). Uses plain fetch throughout.
// ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://povudgtvzggnxwgtjexa.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_ATL_SUPABASE_KEY || '';

function supabaseHeaders(): Record<string, string> {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── 1. submitVideoAdJob ───────────────────────────────────────────
// POST flat config fields to the n8n webhook; returns { job_id }.
export async function submitVideoAdJob(
  config: VideoAdConfig,
): Promise<{ job_id: string }> {
  try {
    const response = await fetch(VIDEO_AD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: config.branch,
        product_description: config.product_description,
        target_segment: config.target_segment,
        tone: config.tone,
        cta: config.cta,
        actor_style: config.actor_style,
        actor_gender: config.actor_gender,
        voice_style: config.voice_style,
        video_duration: config.video_duration,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Video ad webhook error (${response.status}): ${text}`);
    }

    return await response.json();
  } catch (err: any) {
    throw new Error(`Failed to submit video ad job: ${err.message}`);
  }
}

// ─── 2. pollVideoAdJob ────────────────────────────────────────────
// Fetch a single job by ID from the Supabase REST API.
export async function pollVideoAdJob(
  jobId: string,
): Promise<VideoAdJob | null> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/video_ad_jobs?id=eq.${jobId}&select=*`,
      { headers: supabaseHeaders() },
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
  branch?: string,
  limit: number = 20,
): Promise<VideoAdJob[]> {
  try {
    let url = `${SUPABASE_URL}/rest/v1/video_ad_jobs?select=*&order=created_at.desc&limit=${limit}`;
    if (branch) {
      url += `&branch=eq.${branch}`;
    }

    const response = await fetch(url, { headers: supabaseHeaders() });

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
export async function cancelVideoAdJob(jobId: string): Promise<void> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/video_ad_jobs?id=eq.${jobId}`,
      {
        method: 'PATCH',
        headers: {
          ...supabaseHeaders(),
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

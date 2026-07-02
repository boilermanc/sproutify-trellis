import { MusicGenConfig, MusicGeneration } from '../types';
import { MUSIC_GEN_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';

// ─── Trellis Studio Service ─────────────────────────────────────────
// Submission goes to n8n via webhook (fire-and-forget) — Lyria generation
// takes real wall-clock time and Cloudflare would 524 on a synchronous
// request. Polling/listing use the Hub Supabase client (music_generations
// is orchestration data on the Hub, same as video_ad_jobs).
// ─────────────────────────────────────────────────────────────────────

// ─── 1. submitMusicJob ──────────────────────────────────────────────
// Generate a job_id client-side, fire the webhook (don't await — n8n
// processing is slow), and return the id so the poller can track it.
// n8n MUST use this job_id as the music_generations row id.
export async function submitMusicJob(
  config: MusicGenConfig,
  createdBy?: string | null,
): Promise<{ job_id: string }> {
  const job_id = crypto.randomUUID();

  fetch(MUSIC_GEN_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_id,
      branch: config.branch,
      created_by: createdBy ?? null,
      title: config.title,
      prompt: config.prompt,
      genre: config.genre,
      mood: config.mood,
      vocal_style: config.vocal_style,
      duration_seconds: config.duration_seconds,
    }),
  }).catch(() => {
    // Expected — Cloudflare 524 / CORS on the response. The request still
    // reaches n8n and the job will surface in Supabase.
    console.log('[music] Webhook fire-and-forget completed (response unreadable, expected)');
  });

  return { job_id };
}

// ─── 2. pollMusicJob ────────────────────────────────────────────────
export async function pollMusicJob(jobId: string): Promise<MusicGeneration | null> {
  const { data, error } = await supabase
    .from('music_generations')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(`Failed to poll music job ${jobId}: ${error.message}`);
  return data as MusicGeneration | null;
}

// ─── 3. getMusicJobs ────────────────────────────────────────────────
export async function getMusicJobs(branch?: string, limit: number = 50): Promise<MusicGeneration[]> {
  let query = supabase
    .from('music_generations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (branch) query = query.eq('branch', branch);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list music jobs: ${error.message}`);
  return (data as MusicGeneration[]) ?? [];
}

// ─── 4. archiveMusicJob ─────────────────────────────────────────────
export async function archiveMusicJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('music_generations')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw new Error(`Failed to archive music job ${jobId}: ${error.message}`);
}

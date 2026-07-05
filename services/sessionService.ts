import { GoogleGenAI } from '@google/genai';
import {
  MusicSession, MusicTrack, MusicRender, CreateSessionConfig, SessionStatus,
} from '../types';
import { MUSIC_SESSION_TRACK_WEBHOOK, MUSIC_SESSION_GENERATE_WEBHOOK, MUSIC_STITCH_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';

// ─── Trellis Sessions Service ───────────────────────────────────────
// A "session" is a set of AI-generated tracks stitched into one master.
// Plan generation uses client-side Gemini (same pattern as Video Ad Lab).
// Track generation (Lyria) and stitching (Python worker) are heavy/long,
// so they run behind fire-and-forget webhooks. All rows live on the Hub.
// ─────────────────────────────────────────────────────────────────────

const PLAN_MODEL = 'gemini-3-flash-preview';

interface PlannedTrack { title: string; prompt: string; }

const POLICY_SENSITIVE_MUSIC_TERMS = [
  /\bafter\s+dark\b/gi,
  /\blate[-\s]?night\b/gi,
  /\bmidnight\b/gi,
  /\bromantic\b/gi,
  /\bintimate\b/gi,
  /\bsensual\b/gi,
  /\bseductive\b/gi,
  /\bpassionate\b/gi,
  /\blove\b/gi,
  /\bwhisper\w*\b/gi,
  /\bcandlelight\b/gi,
  /\bvelvet\b/gi,
  /\bsatin\b/gi,
  /\bsmoky\b/gi,
  /\bsmoke\b/gi,
  /\balcohol\b/gi,
  /\bdrugs?\b/gi,
];

function sanitizeMusicPrompt(prompt: string, genre?: string | null, mood?: string | null, trackNumber?: number): string {
  const fallbackBpm = 68 + (((trackNumber ?? 1) - 1) % 5) * 3;
  const bpm = prompt.match(/\b([5-9]\d|1[0-6]\d)\s*BPM\b/i)?.[1] ?? String(fallbackBpm);
  const normalizedGenre = (genre || 'instrumental jazz').toLowerCase();
  const normalizedMood = (mood || 'mellow').toLowerCase();

  let safe = prompt;
  for (const pattern of POLICY_SENSITIVE_MUSIC_TERMS) safe = safe.replace(pattern, '');
  safe = safe
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .trim();

  const hasInstruments = /\b(piano|bass|drums|guitar|saxophone|trumpet|flute|vibraphone|rhodes|organ|cello|percussion|cymbals)\b/i.test(safe);
  if (!hasInstruments || safe.length < 50) {
    safe = `${normalizedGenre} instrumental arrangement with piano, upright bass, brushed drums, and warm lead melody, ${normalizedMood} clean studio sound at ${bpm} BPM.`;
  }

  return safe
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .slice(0, 240)
    .trim();
}

// ─── 1. Generate a track plan with Gemini (client-side) ─────────────
async function generateTrackPlan(
  config: CreateSessionConfig,
  trackCount: number,
  avgLen: number,
  geminiApiKey: string,
): Promise<PlannedTrack[]> {
  const fallback = (): PlannedTrack[] =>
    Array.from({ length: trackCount }, (_, i) => ({
      title: `${config.title} — Track ${i + 1}`,
      prompt: `Original ${config.genre || 'instrumental'} track, ${config.mood || 'cohesive'} mood, ~${avgLen}s, part of the "${config.title}" session. Keep the vibe consistent with the rest of the set.`,
    }));

  if (!geminiApiKey) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const instruction = `You are curating a cohesive ${Math.round((trackCount * avgLen) / 60)}-minute music session.
Title: "${config.title}"
Genre: ${config.genre || 'any'}
Mood: ${config.mood || 'any'}
Vocals: ${config.vocal_style || 'instrumental'}

Create exactly ${trackCount} tracks that flow well back-to-back.

For each track return a short title and a CONCISE prompt for an AI music model. Each prompt MUST:
- be ONE sentence, ~15-30 words max (no multi-part stories or timelines)
- describe only instruments, genre, mood, and tempo (a BPM)
- NOT reference any real artist, band, song, label, or brand name
- avoid narrative/story language, romance/relationship language, nightlife language, sensual descriptors, and any mention of smoking, drugs, alcohol, violence, or explicit or edgy themes
Keep the set stylistically consistent.

Return ONLY a raw JSON array, no markdown, no commentary:
[{"title":"...","prompt":"A smooth late-night jazz piece with upright bass, brushed drums, and soft Rhodes piano, mellow and warm, around 80 BPM."}]`;

    const response = await ai.models.generateContent({ model: PLAN_MODEL, contents: instruction });
    const raw = (response.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw) as PlannedTrack[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback();
    return parsed.slice(0, trackCount).map((t, i) => ({
      title: (t.title || `Track ${i + 1}`).toString(),
      prompt: (t.prompt || fallback()[i].prompt).toString(),
    }));
  } catch (err) {
    console.warn('[sessions] plan generation failed, using fallback', err);
    return fallback();
  }
}

// ─── 2. createSessionWithPlan ───────────────────────────────────────
export async function createSessionWithPlan(
  config: CreateSessionConfig,
  geminiApiKey: string,
  createdBy?: string | null,
): Promise<{ session: MusicSession; tracks: MusicTrack[] }> {
  const target = config.target_duration_seconds ?? 3600;
  const avgLen = config.avg_track_length_seconds ?? 180;
  const trackCount = Math.max(1, Math.min(24, config.track_count ?? Math.max(1, Math.round(target / avgLen))));

  // Insert the session (planning)
  const { data: session, error: sErr } = await supabase
    .from('trellis_music_sessions')
    .insert({
      branch: config.branch,
      created_by: createdBy ?? null,
      title: config.title,
      target_duration_seconds: target,
      genre: config.genre ?? null,
      mood: config.mood ?? null,
      track_count: trackCount,
      avg_track_length_seconds: avgLen,
      status: 'planning',
    })
    .select('*')
    .single();
  if (sErr || !session) throw new Error(`Could not create session: ${sErr?.message}`);

  // Plan + insert tracks
  const plan = await generateTrackPlan(config, trackCount, avgLen, geminiApiKey);
  const trackRows = plan.map((t, i) => ({
    session_id: session.id,
    track_number: i + 1,
    title: t.title,
    prompt: sanitizeMusicPrompt(t.prompt, config.genre, config.mood, i + 1),
    genre: config.genre ?? null,
    mood: config.mood ?? null,
    vocal_style: config.vocal_style ?? null,
    duration_seconds: avgLen,
    status: 'planned' as const,
  }));

  const { data: tracks, error: tErr } = await supabase
    .from('trellis_music_tracks')
    .insert(trackRows)
    .select('*');
  if (tErr) throw new Error(`Could not save track plan: ${tErr.message}`);

  await supabase.from('trellis_music_sessions')
    .update({ status: 'planned', updated_at: new Date().toISOString() })
    .eq('id', session.id);

  return {
    session: { ...(session as MusicSession), status: 'planned' },
    tracks: ((tracks as MusicTrack[]) ?? []).sort((a, b) => a.track_number - b.track_number),
  };
}

// ─── 3. Reads ───────────────────────────────────────────────────────
export async function getSessions(branch?: string, limit = 50): Promise<MusicSession[]> {
  let q = supabase.from('trellis_music_sessions').select('*').order('created_at', { ascending: false }).limit(limit);
  if (branch) q = q.eq('branch', branch);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to list sessions: ${error.message}`);
  return (data as MusicSession[]) ?? [];
}

export async function getSession(id: string): Promise<MusicSession | null> {
  const { data, error } = await supabase.from('trellis_music_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load session: ${error.message}`);
  return data as MusicSession | null;
}

export async function getTracks(sessionId: string): Promise<MusicTrack[]> {
  const { data, error } = await supabase.from('trellis_music_tracks').select('*').eq('session_id', sessionId).order('track_number');
  if (error) throw new Error(`Failed to load tracks: ${error.message}`);
  return (data as MusicTrack[]) ?? [];
}

export async function getRenders(sessionId: string): Promise<MusicRender[]> {
  const { data, error } = await supabase.from('trellis_music_renders').select('*').eq('session_id', sessionId).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load renders: ${error.message}`);
  return (data as MusicRender[]) ?? [];
}

export async function pollTrack(id: string): Promise<MusicTrack | null> {
  const { data } = await supabase.from('trellis_music_tracks').select('*').eq('id', id).maybeSingle();
  return data as MusicTrack | null;
}

export async function pollRender(id: string): Promise<MusicRender | null> {
  const { data } = await supabase.from('trellis_music_renders').select('*').eq('id', id).maybeSingle();
  return data as MusicRender | null;
}

// ─── 4. Generate tracks (fire n8n Lyria worker per planned track) ───
export async function generateSessionTracks(session: MusicSession, tracks: MusicTrack[]): Promise<void> {
  const pending = tracks.filter(t => t.status === 'planned' || t.status === 'failed');
  if (pending.length === 0) return;

  // Queue the pending tracks before starting n8n. The session workflow reads
  // queued rows only, so completed tracks are never picked up again.
  await supabase.from('trellis_music_tracks')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .in('id', pending.map(t => t.id));
  await supabase.from('trellis_music_sessions')
    .update({ status: 'generating', updated_at: new Date().toISOString() }).eq('id', session.id);

  // Fire ONE session-level webhook. n8n fetches the queued tracks and
  // generates them ONE AT A TIME (Split In Batches + Wait) so we never flood
  // Lyria's preview quota, regardless of how many tracks the session has.
  fetch(MUSIC_SESSION_GENERATE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: session.id, branch: session.branch }),
  }).catch(() => { /* fire-and-forget */ });
}

export async function setTrackApproved(trackId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from('trellis_music_tracks')
    .update({ approved, updated_at: new Date().toISOString() }).eq('id', trackId);
  if (error) throw new Error(`Failed to update track: ${error.message}`);
}

export async function regenerateTrack(session: MusicSession, track: MusicTrack): Promise<void> {
  await supabase.from('trellis_music_tracks')
    .update({ status: 'generating', approved: false, error_message: null, updated_at: new Date().toISOString() })
    .eq('id', track.id);
  fetch(MUSIC_SESSION_TRACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      track_id: track.id, session_id: session.id, branch: session.branch,
      track_number: track.track_number, title: track.title,
      prompt: sanitizeMusicPrompt(track.prompt, track.genre, track.mood, track.track_number),
      genre: track.genre, mood: track.mood, vocal_style: track.vocal_style,
      duration_seconds: track.duration_seconds,
    }),
  }).catch(() => {});
}

// ─── 5. Stitch approved tracks (fire Python worker) ─────────────────
export async function stitchSession(session: MusicSession, approvedTracks: MusicTrack[]): Promise<{ render_id: string }> {
  if (approvedTracks.length === 0) throw new Error('Approve at least one track before stitching.');

  const { data: render, error } = await supabase
    .from('trellis_music_renders')
    .insert({
      session_id: session.id,
      render_type: 'master',
      status: 'queued',
      track_ids: approvedTracks.map(t => t.id),
    })
    .select('*')
    .single();
  if (error || !render) throw new Error(`Could not create render job: ${error?.message}`);

  fetch(MUSIC_STITCH_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      render_id: render.id,
      session_id: session.id,
      branch: session.branch,
      tracks: approvedTracks.map(t => ({ id: t.id, track_number: t.track_number, audio_url: t.audio_url })),
    }),
  }).catch(() => { /* fire-and-forget: worker gets it even if response unreadable */ });

  await supabase.from('trellis_music_sessions')
    .update({
      status: 'stitching',
      final_audio_url: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', session.id);

  return { render_id: render.id };
}

export async function archiveSession(id: string): Promise<void> {
  await supabase.from('trellis_music_sessions')
    .update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  await supabase.from('trellis_music_sessions')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

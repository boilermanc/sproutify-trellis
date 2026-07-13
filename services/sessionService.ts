import { GoogleGenAI } from '@google/genai';
import {
  MusicSession, MusicTrack, MusicRender, CreateSessionConfig, SessionStatus,
} from '../types';
import { MUSIC_STITCH_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';

// ─── Trellis Sessions Service ───────────────────────────────────────
// A "session" is a set of AI-generated tracks stitched into one master.
// Plan generation uses client-side Gemini (same pattern as Video Ad Lab).
// Track generation (Lyria) runs through a Supabase Edge Function queue worker.
// Stitching remains in the Python worker behind a fire-and-forget webhook.
// ─────────────────────────────────────────────────────────────────────

const PLAN_MODEL = 'gemini-3-flash-preview';
const SESSION_TRACK_WORKER = 'generate-session-track';
const MAX_SESSION_TRACKS = 40;
const RELIABLE_GENERATED_TRACK_SECONDS = 165;

interface PlannedTrack { title: string; prompt: string; }
const DEFAULT_VOCAL_STYLE = 'Instrumental only';

function calculateTrackCount(targetSeconds: number, avgLen: number, requested?: number): number {
  if (requested && Number.isFinite(requested)) {
    return Math.max(1, Math.min(MAX_SESSION_TRACKS, Math.round(requested)));
  }
  const effectiveAvg = Math.max(15, avgLen);
  return Math.max(1, Math.min(MAX_SESSION_TRACKS, Math.ceil(targetSeconds / effectiveAvg)));
}

function assertSupportedTrackLength(avgLen: number): void {
  if (avgLen > RELIABLE_GENERATED_TRACK_SECONDS) {
    throw new Error(`Lyria currently returns about ${RELIABLE_GENERATED_TRACK_SECONDS}s per generated track. Use more tracks or reduce the target length.`);
  }
}

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

function splitVocalMix(vocalStyle?: string | null): string[] {
  const raw = (vocalStyle || DEFAULT_VOCAL_STYLE).replace(/^mix:\s*/i, '');
  const parts = raw.split(',').map(v => v.trim()).filter(Boolean);
  return parts.length ? parts : [DEFAULT_VOCAL_STYLE];
}

function vocalStyleForTrack(vocalStyle: string | undefined, index: number): string {
  const mix = splitVocalMix(vocalStyle);
  return mix[index % mix.length] || DEFAULT_VOCAL_STYLE;
}

function vocalPromptFragment(vocalStyle?: string | null): string {
  const normalized = (vocalStyle || DEFAULT_VOCAL_STYLE).toLowerCase();
  if (normalized.includes('duet')) return 'subtle wordless male and female vocal harmonies';
  if (normalized.includes('female')) return 'subtle wordless female vocal texture';
  if (normalized.includes('male')) return 'subtle wordless male vocal texture';
  return 'instrumental';
}

function safeArrangementPrompt(genre: string, mood: string, bpm: string, vocalFragment: string): string {
  const withVocals = vocalFragment !== 'instrumental' ? ` with ${vocalFragment}` : '';
  if (genre.includes('spy')) {
    return `Original spy jazz instrumental${withVocals}, surf guitar lead, muted trumpet, vibraphone, upright bass, brushed drums, dramatic brass stabs, suspenseful ${mood} feel, ${bpm} BPM.`;
  }
  return vocalFragment === 'instrumental'
    ? `${genre} instrumental smooth jazz quartet with tenor saxophone lead, Rhodes electric piano, upright bass, brushed drums, clean studio mix, relaxed ${mood} feel, ${bpm} BPM.`
    : `${genre} smooth jazz quartet with ${vocalFragment}, tenor saxophone lead, Rhodes electric piano, upright bass, brushed drums, clean studio mix, relaxed ${mood} feel, ${bpm} BPM.`;
}

function describeVocalPlan(vocalStyle?: string | null): string {
  const mix = splitVocalMix(vocalStyle);
  return mix.length === 1
    ? mix[0]
    : `rotate evenly across tracks: ${mix.join(', ')}`;
}

function sanitizeMusicPrompt(prompt: string, genre?: string | null, mood?: string | null, trackNumber?: number, title?: string | null, vocalStyle?: string | null): string {
  const fallbackBpm = 68 + (((trackNumber ?? 1) - 1) % 5) * 3;
  const bpm = prompt.match(/\b([5-9]\d|1[0-6]\d)\s*BPM\b/i)?.[1] ?? String(fallbackBpm);
  const normalizedGenre = (genre || 'instrumental jazz').toLowerCase();
  const normalizedMood = (mood || 'mellow').toLowerCase();
  const vocalFragment = vocalPromptFragment(vocalStyle);
  const checkText = `${title || ''} ${prompt}`;
  const hadSensitiveTerms = POLICY_SENSITIVE_MUSIC_TERMS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(checkText);
  });

  const safePrompt = safeArrangementPrompt(normalizedGenre, normalizedMood, bpm, vocalFragment);
  if (hadSensitiveTerms) return safePrompt.slice(0, 240);

  let safe = prompt;
  for (const pattern of POLICY_SENSITIVE_MUSIC_TERMS) safe = safe.replace(pattern, '');
  safe = safe
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .trim();

  const hasInstruments = /\b(piano|bass|drums|guitar|saxophone|trumpet|flute|vibraphone|rhodes|organ|cello|percussion|cymbals)\b/i.test(safe);
  if (!hasInstruments || safe.length < 50) {
    safe = safePrompt;
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
      prompt: `Original ${config.genre || 'instrumental'} track with ${vocalPromptFragment(vocalStyleForTrack(config.vocal_style, i))}, ${config.mood || 'cohesive'} mood, ${avgLen}s, clean studio arrangement, ${70 + (i % 5) * 3} BPM.`,
    }));

  if (!geminiApiKey) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const instruction = `You are curating a cohesive ${Math.round((trackCount * avgLen) / 60)}-minute music session.
Title: "${config.title}"
Genre: ${config.genre || 'any'}
Mood: ${config.mood || 'any'}
Vocals: ${describeVocalPlan(config.vocal_style)}

Create exactly ${trackCount} tracks that flow well back-to-back.

For each track return a short title and a CONCISE prompt for an AI music model. Each prompt MUST:
- be ONE sentence, ~15-30 words max (no multi-part stories or timelines)
- describe only instruments, genre, mood, and tempo (a BPM)
- NOT reference any real artist, band, song, label, or brand name
- avoid narrative/story language, romance/relationship language, nightlife language, sensual descriptors, and any mention of smoking, drugs, alcohol, violence, or explicit or edgy themes
- for smooth jazz sessions, prefer tenor saxophone, Rhodes electric piano, upright bass, brushed drums, muted trumpet, and clean guitar
- for spy jazz sessions, use original 1960s-inspired cinematic lounge language with surf guitar, muted trumpet, vibraphone, upright bass, brushed drums, and dramatic brass stabs
- for spy jazz sessions, do not reference James Bond, 007, Mission Impossible, spy films, real franchises, theme songs, or soundtrack names
- avoid classical piano solo, concert hall, orchestral, soundtrack, solo recital, and big band
- use the requested vocal plan across the set; for Instrumental only tracks, do not include vocals; for vocal tracks, prefer subtle wordless vocals or light vocal texture without lyrics
Keep the set stylistically consistent.

Return ONLY a raw JSON array, no markdown, no commentary:
[{"title":"...","prompt":"Instrumental smooth jazz quartet with tenor saxophone lead, Rhodes electric piano, upright bass, brushed drums, mellow clean studio sound, 74 BPM."}]`;

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
  assertSupportedTrackLength(avgLen);
  const trackCount = calculateTrackCount(target, avgLen, config.track_count);

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
  const trackRows = plan.map((t, i) => {
    const trackVocalStyle = vocalStyleForTrack(config.vocal_style, i);
    return {
      session_id: session.id,
      track_number: i + 1,
      title: t.title,
      prompt: sanitizeMusicPrompt(t.prompt, config.genre, config.mood, i + 1, t.title, trackVocalStyle),
      genre: config.genre ?? null,
      mood: config.mood ?? null,
      vocal_style: trackVocalStyle,
      duration_seconds: avgLen,
      status: 'planned' as const,
    };
  });

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

export async function appendSessionTracks(
  session: MusicSession,
  count: number,
  geminiApiKey: string,
): Promise<MusicTrack[]> {
  const existingTracks = await getTracks(session.id);
  const remainingSlots = Math.max(0, MAX_SESSION_TRACKS - existingTracks.length);
  if (remainingSlots <= 0) throw new Error(`This session already has the maximum ${MAX_SESSION_TRACKS} tracks.`);
  const requestedCount = Number.isFinite(count) ? Math.round(count) : 1;
  const addCount = Math.max(1, Math.min(remainingSlots, requestedCount));

  const avgLen = session.avg_track_length_seconds ?? 180;
  assertSupportedTrackLength(avgLen);
  const nextTrackNumber = existingTracks.reduce((max, t) => Math.max(max, t.track_number || 0), 0) + 1;
  const existingVocals = existingTracks
    .map(t => t.vocal_style)
    .filter((v): v is string => !!v);
  const vocalStyle = existingVocals.length ? Array.from(new Set(existingVocals)).join(', ') : DEFAULT_VOCAL_STYLE;
  const config: CreateSessionConfig = {
    branch: session.branch || '',
    title: session.title,
    genre: session.genre || undefined,
    mood: session.mood || undefined,
    vocal_style: vocalStyle,
    target_duration_seconds: session.target_duration_seconds ?? addCount * avgLen,
    avg_track_length_seconds: avgLen,
    track_count: addCount,
  };

  const plan = await generateTrackPlan(config, addCount, avgLen, geminiApiKey);
  const trackRows = plan.map((t, i) => {
    const trackNumber = nextTrackNumber + i;
    const trackVocalStyle = vocalStyleForTrack(vocalStyle, trackNumber - 1);
    return {
      session_id: session.id,
      track_number: trackNumber,
      title: t.title,
      prompt: sanitizeMusicPrompt(t.prompt, session.genre, session.mood, trackNumber, t.title, trackVocalStyle),
      genre: session.genre ?? null,
      mood: session.mood ?? null,
      vocal_style: trackVocalStyle,
      duration_seconds: avgLen,
      status: 'planned' as const,
    };
  });

  const { data: tracks, error } = await supabase
    .from('trellis_music_tracks')
    .insert(trackRows)
    .select('*');
  if (error) throw new Error(`Could not add tracks: ${error.message}`);

  await supabase.from('trellis_music_sessions')
    .update({
      track_count: existingTracks.length + ((tracks as MusicTrack[]) ?? []).length,
      status: session.status === 'archived' ? 'archived' : 'planned',
      final_audio_url: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  return ((tracks as MusicTrack[]) ?? []).sort((a, b) => a.track_number - b.track_number);
}

// ─── 3. Reads ───────────────────────────────────────────────────────
export async function getSessions(branch?: string, limit = 50): Promise<MusicSession[]> {
  let q = supabase.from('trellis_music_sessions').select('*').order('updated_at', { ascending: false }).limit(limit);
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

// ─── 4. Generate tracks (Edge Function queue worker) ────────────────
async function startTrackWorker(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke(SESSION_TRACK_WORKER, { body });
  if (error) throw new Error(`Music worker is not available: ${error.message}`);
}

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

  await startTrackWorker({ session_id: session.id, branch: session.branch, continue_queue: true });
}

export async function resumeSessionGeneration(session: MusicSession, tracks: MusicTrack[]): Promise<void> {
  const queued = tracks.filter(t => t.status === 'queued');
  const staleGenerating = tracks.filter(t => {
    if (t.status !== 'generating') return false;
    const updated = new Date(t.updated_at || 0).getTime();
    return Number.isFinite(updated) && Date.now() - updated >= 20 * 60 * 1000;
  });
  const resetIds = staleGenerating.map(t => t.id);

  if (queued.length === 0 && resetIds.length === 0) {
    throw new Error('No queued or stale tracks to resume.');
  }

  if (resetIds.length > 0) {
    const { error } = await supabase.from('trellis_music_tracks')
      .update({ status: 'queued', error_message: null, updated_at: new Date().toISOString() })
      .in('id', resetIds);
    if (error) throw new Error(`Failed to reset stale tracks: ${error.message}`);
  }

  await supabase.from('trellis_music_sessions')
    .update({ status: 'generating', error_message: null, updated_at: new Date().toISOString() }).eq('id', session.id);

  await startTrackWorker({ session_id: session.id, branch: session.branch, continue_queue: true });
}

export async function setTrackApproved(trackId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from('trellis_music_tracks')
    .update({ approved, updated_at: new Date().toISOString() }).eq('id', trackId);
  if (error) throw new Error(`Failed to update track: ${error.message}`);
}

export async function setTracksApproved(trackIds: string[], approved: boolean): Promise<void> {
  if (trackIds.length === 0) return;
  const { error } = await supabase.from('trellis_music_tracks')
    .update({ approved, updated_at: new Date().toISOString() })
    .in('id', trackIds);
  if (error) throw new Error(`Failed to update tracks: ${error.message}`);
}

export async function deletePlannedTrack(sessionId: string, trackId: string, nextTrackCount: number): Promise<void> {
  const { data, error } = await supabase.from('trellis_music_tracks')
    .delete()
    .eq('id', trackId)
    .eq('session_id', sessionId)
    .eq('status', 'planned')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to delete track plan: ${error.message}`);
  if (!data) throw new Error('Only planned tracks can be deleted.');

  const { error: sessionError } = await supabase.from('trellis_music_sessions')
    .update({
      track_count: Math.max(0, nextTrackCount),
      final_audio_url: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (sessionError) throw new Error(`Failed to update session: ${sessionError.message}`);
}

export async function regenerateTrack(session: MusicSession, track: MusicTrack): Promise<void> {
  const { error } = await supabase.from('trellis_music_tracks')
    .update({
      status: 'queued',
      approved: false,
      audio_url: null,
      storage_bucket: null,
      storage_path: null,
      audio_mime_type: null,
      file_size_bytes: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', track.id);
  if (error) throw new Error(`Failed to reset track: ${error.message}`);
  await startTrackWorker({ session_id: session.id, track_id: track.id, branch: session.branch, continue_queue: false });
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

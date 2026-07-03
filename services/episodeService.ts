import { GoogleGenAI } from '@google/genai';
import {
  Episode, EpisodeAsset, EpisodeMetadata, EpisodePublication,
  CreateEpisodeConfig, EpisodeStatus, AssetType, PublishPlatform, MusicSession,
} from '../types';
import { EPISODE_VIDEO_WEBHOOK, EPISODE_PUBLISH_WEBHOOK, EpisodeArtStyle } from '../constants';
import { supabase } from '../lib/supabase';
import { getTracks, getRenders } from './sessionService';

// ─── Trellis Episodes Service ───────────────────────────────────────
// The Episode is the top-level production record. Music (a session) is
// the first asset; artwork, video, metadata and publications hang off it.
// Heavy work (artwork gen, video render, publish) runs behind webhooks.
// ─────────────────────────────────────────────────────────────────────

const META_MODEL = 'gemini-3-flash-preview';

const ASSET_DIMS: Partial<Record<AssetType, { width: number; height: number }>> = {
  cover_art: { width: 1920, height: 1080 },
  thumbnail: { width: 1280, height: 720 },
  vertical: { width: 1080, height: 1920 },
};

// ─── CRUD ───────────────────────────────────────────────────────────
export async function createEpisode(config: CreateEpisodeConfig, createdBy?: string | null): Promise<Episode> {
  const { data, error } = await supabase.from('trellis_episodes').insert({
    branch: config.branch,
    created_by: createdBy ?? null,
    title: config.title,
    show_name: config.show_name ?? null,
    theme: config.theme ?? null,
    session_id: config.session_id ?? null,
    status: config.session_id ? 'master' : 'music',
  }).select('*').single();
  if (error || !data) throw new Error(`Could not create episode: ${error?.message}`);
  return data as Episode;
}

export async function getEpisodes(branch?: string, limit = 50): Promise<Episode[]> {
  let q = supabase.from('trellis_episodes').select('*').order('created_at', { ascending: false }).limit(limit);
  if (branch) q = q.eq('branch', branch);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to list episodes: ${error.message}`);
  return (data as Episode[]) ?? [];
}

export async function getEpisode(id: string): Promise<Episode | null> {
  const { data, error } = await supabase.from('trellis_episodes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load episode: ${error.message}`);
  return data as Episode | null;
}

export async function getAssets(episodeId: string): Promise<EpisodeAsset[]> {
  const { data, error } = await supabase.from('trellis_episode_assets').select('*').eq('episode_id', episodeId).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  return (data as EpisodeAsset[]) ?? [];
}

export async function getMetadata(episodeId: string): Promise<EpisodeMetadata | null> {
  const { data } = await supabase.from('trellis_episode_metadata').select('*').eq('episode_id', episodeId).maybeSingle();
  return data as EpisodeMetadata | null;
}

export async function getPublications(episodeId: string): Promise<EpisodePublication[]> {
  const { data, error } = await supabase.from('trellis_episode_publications').select('*').eq('episode_id', episodeId).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load publications: ${error.message}`);
  return (data as EpisodePublication[]) ?? [];
}

export async function setEpisodeStatus(id: string, status: EpisodeStatus): Promise<void> {
  await supabase.from('trellis_episodes').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function linkSession(episodeId: string, sessionId: string): Promise<void> {
  await supabase.from('trellis_episodes').update({ session_id: sessionId, status: 'master', updated_at: new Date().toISOString() }).eq('id', episodeId);
  await supabase.from('trellis_music_sessions').update({ episode_id: episodeId, updated_at: new Date().toISOString() }).eq('id', sessionId);
}

export async function setAssetApproved(assetId: string, approved: boolean): Promise<void> {
  await supabase.from('trellis_episode_assets').update({ approved, updated_at: new Date().toISOString() }).eq('id', assetId);
}

// ─── Master: resolve the session's stitched master audio ────────────
export async function getSessionMasterUrl(sessionId: string): Promise<string | null> {
  const renders = await getRenders(sessionId);
  return renders.find(r => r.status === 'ready')?.final_audio_url ?? null;
}

// ─── Artwork (Gemini scene → image model → episode-assets) ──────────
export async function generateArtwork(episode: Episode, assetType: AssetType, extraPrompt?: string, style?: EpisodeArtStyle): Promise<EpisodeAsset> {
  const dims = ASSET_DIMS[assetType] ?? { width: 1920, height: 1080 };
  const { data: asset, error } = await supabase.from('trellis_episode_assets').insert({
    episode_id: episode.id, asset_type: assetType, status: 'queued', width: dims.width, height: dims.height,
  }).select('*').single();
  if (error || !asset) throw new Error(`Could not queue artwork: ${error?.message}`);

  // Fire the artwork generator edge function: Gemini writes an on-theme scene in the
  // chosen style's setting, the image model renders it in that style, uploads to
  // episode-assets, and PATCHes this asset row to ready. Fire-and-forget; the UI polls.
  supabase.functions.invoke('generate-episode-artwork', {
    body: {
      asset_id: asset.id, episode_id: episode.id, branch: episode.branch, asset_type: assetType,
      width: dims.width, height: dims.height,
      title: episode.title, theme: episode.theme || '',
      prompt: `${episode.show_name ? episode.show_name + '. ' : ''}${extraPrompt || ''}`.trim(),
      ...(style ? { style_prompt: style.prompt, setting: style.setting } : {}),
    },
  }).catch(() => {});
  await setEpisodeStatus(episode.id, 'artwork');
  return asset as EpisodeAsset;
}

// ─── Video (fire ffmpeg worker: master audio + cover → mp4) ─────────
export async function buildVideo(episode: Episode, masterAudioUrl: string, coverUrl: string | null, motion: 'ken_burns' | 'none' = 'ken_burns'): Promise<EpisodeAsset> {
  const { data: asset, error } = await supabase.from('trellis_episode_assets').insert({
    episode_id: episode.id, asset_type: 'video_mp4', status: 'queued', width: 1920, height: 1080,
  }).select('*').single();
  if (error || !asset) throw new Error(`Could not queue video: ${error?.message}`);

  fetch(EPISODE_VIDEO_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: asset.id, episode_id: episode.id, branch: episode.branch,
      master_audio_url: masterAudioUrl, cover_image_url: coverUrl, motion,
    }),
  }).catch(() => {});
  await setEpisodeStatus(episode.id, 'video');
  return asset as EpisodeAsset;
}

// ─── Metadata (client-side Gemini + computed chapters) ──────────────
function fmtTime(s: number): string { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

export async function generateMetadata(episode: Episode, session: MusicSession | null, geminiApiKey: string): Promise<EpisodeMetadata> {
  // Chapters from the session's tracks (cumulative time)
  let chapters: { time: string; title: string }[] = [];
  if (session) {
    const tracks = (await getTracks(session.id)).filter(t => t.status === 'completed');
    let t = 0;
    for (const tr of tracks.sort((a, b) => a.track_number - b.track_number)) {
      chapters.push({ time: fmtTime(t), title: tr.title });
      t += tr.duration_seconds || 180;
    }
  }

  let title = episode.title, description = '', tags: string[] = [], hashtags: string[] = [];
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Write YouTube publishing metadata for a ${session?.genre || 'music'} ${session?.mood || ''} session titled "${episode.title}"${episode.show_name ? ` for the show "${episode.show_name}"` : ''}. Theme: ${episode.theme || 'n/a'}.
Return ONLY raw JSON, no markdown:
{"title":"catchy SEO title","description":"long SEO description (audience, style, what to expect)","tags":["20-30 search tags"],"hashtags":["6-10 #hashtags"]}`;
      const resp = await ai.models.generateContent({ model: META_MODEL, contents: prompt });
      const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const j = JSON.parse(raw);
      title = j.title || title;
      description = j.description || '';
      tags = Array.isArray(j.tags) ? j.tags.map(String) : [];
      hashtags = Array.isArray(j.hashtags) ? j.hashtags.map(String) : [];
    } catch (e) { console.warn('[episodes] metadata gen failed, using minimal fallback', e); }
  }

  const { data, error } = await supabase.from('trellis_episode_metadata').upsert({
    episode_id: episode.id, title, description, tags, chapters, hashtags, status: 'ready', updated_at: new Date().toISOString(),
  }, { onConflict: 'episode_id' }).select('*').single();
  if (error || !data) throw new Error(`Could not save metadata: ${error?.message}`);
  await setEpisodeStatus(episode.id, 'metadata');
  return data as EpisodeMetadata;
}

export async function approveMetadata(episodeId: string): Promise<void> {
  await supabase.from('trellis_episode_metadata').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('episode_id', episodeId);
}

// ─── Publish (fire n8n → platform API) ──────────────────────────────
export async function publishEpisode(episode: Episode, platform: PublishPlatform, videoUrl: string | null, metadata: EpisodeMetadata | null): Promise<EpisodePublication> {
  const { data: pub, error } = await supabase.from('trellis_episode_publications').insert({
    episode_id: episode.id, platform, status: 'pending',
  }).select('*').single();
  if (error || !pub) throw new Error(`Could not create publication: ${error?.message}`);

  fetch(EPISODE_PUBLISH_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publication_id: pub.id, episode_id: episode.id, branch: episode.branch, platform,
      video_url: videoUrl,
      metadata: metadata ? {
        title: metadata.title, description: metadata.description,
        tags: metadata.tags, chapters: metadata.chapters, hashtags: metadata.hashtags,
      } : null,
    }),
  }).catch(() => {});
  await setEpisodeStatus(episode.id, 'publishing');
  return pub as EpisodePublication;
}

export async function archiveEpisode(id: string): Promise<void> {
  await supabase.from('trellis_episodes').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
}

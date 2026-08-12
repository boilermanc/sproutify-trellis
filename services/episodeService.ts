import { GoogleGenAI } from '@google/genai';
import {
  Episode, EpisodeAsset, EpisodeMetadata, EpisodePublication,
  CreateEpisodeConfig, EpisodeStatus, AssetType, PublishPlatform, MusicSession, YouTubeDailyMetric, EpisodeChapter,
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

function sanitizeArtworkText(value?: string | null): string {
  return (value || '')
    .replace(/\bsmoky\b/gi, 'moody')
    .replace(/\bsmoke[-\s]?filled\b/gi, 'low-lit')
    .replace(/\bsmoke\b/gi, 'atmosphere')
    .replace(/\bcigarettes?\b/gi, '')
    .replace(/\bcigars?\b/gi, '')
    .replace(/\btobacco\b/gi, '')
    .replace(/\bashtrays?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizePublishingText(value?: string | null): string {
  return (value || '')
    .replace(/\bsmoky\b/gi, 'moody')
    .replace(/\bsmoke[-\s]?filled\b/gi, 'low-lit')
    .replace(/\bsmoke\b/gi, 'atmosphere')
    .replace(/\bsmoking\b/gi, '')
    .replace(/\bcigarettes?\b/gi, '')
    .replace(/\bcigars?\b/gi, '')
    .replace(/\btobacco\b/gi, '')
    .replace(/\bashtrays?\b/gi, '')
    .replace(/\bromantic\b/gi, 'mellow')
    .replace(/\bsensual\b/gi, 'smooth')
    .replace(/\bintimate\b/gi, 'relaxed')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizePublishingTitle(value: string, showName?: string | null): string {
  let clean = sanitizePublishingText(value);
  const show = sanitizePublishingText(showName);
  if (show) {
    const escaped = escapeRegExp(show);
    clean = clean
      .replace(new RegExp(`^${escaped}\\s+[—-]\\s+${escaped}\\s+[—-]\\s+`, 'i'), `${show} — `)
      .replace(new RegExp(`^${escaped}\\s+[—-]\\s+${escaped}\\b`, 'i'), show);
  }
  return clean;
}

function sanitizePublishingList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(v => sanitizePublishingText(String(v))).filter(Boolean)
    : [];
}

function sanitizeYoutubeTag(value: string): string {
  return sanitizePublishingText(value)
    .replace(/^#+/, '')
    .replace(/[,|;]/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45)
    .trim();
}

function sanitizeYoutubeTags(values: unknown, maxTags = 15, maxTotalChars = 380): string[] {
  const source = Array.isArray(values) ? values : [];
  const tags: string[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (const raw of source) {
    const tag = sanitizeYoutubeTag(String(raw));
    const key = tag.toLowerCase();
    if (tag.length < 2 || seen.has(key)) continue;

    const nextTotal = total + tag.length + (tags.length > 0 ? 1 : 0);
    if (tags.length >= maxTags || nextTotal > maxTotalChars) break;

    tags.push(tag);
    seen.add(key);
    total = nextTotal;
  }

  return tags;
}

function formatChapterBlock(chapters?: EpisodeChapter[] | null): string {
  if (!chapters?.length) return '';
  const lines = chapters
    .map(c => `${c.time || '0:00'} ${sanitizePublishingText(c.title)}`.trim())
    .filter(Boolean);
  return lines.length ? `Chapters:\n${lines.join('\n')}` : '';
}

function publishingFooter(title: string, chapters?: EpisodeChapter[] | null): string {
  const cleanTitle = sanitizePublishingText(title) || 'this mix';
  const chapterBlock = formatChapterBlock(chapters);
  return [
    'Join the conversation: Which track title, mood, or city should we explore next?',
    '',
    'Rekkrd After Dark is a mood-music companion from Rekkrd — the app built for people who actually live with their vinyl. Track your collection, catalog your gear, and rediscover what you own with AI-powered scanning that turns a snapshot of a label into full pressing details and real market value. Built by a collector, for collectors. rekkrd.com',
    '',
    chapterBlock,
    chapterBlock ? '' : null,
    'Content note: Sound and visuals are AI-generated. Tracks are curated, selected, and sometimes mixed by a human. Visuals may be refined or edited before publishing.',
    'How this was made: Made with AI. Sounds or visuals were altered or fully generated.',
    '',
    `Subscribe for more long-form instrumental sessions like ${cleanTitle}.`,
  ].filter(part => part !== null).join('\n');
}

function engagementComment(title: string): string {
  const cleanTitle = sanitizePublishingText(title) || 'this session';
  return `Which setting should we explore next after ${cleanTitle}? Drop a city, mood, or track title idea in the comments.`;
}

function withPublishingFooter(description: string, title: string, chapters?: EpisodeChapter[] | null): string {
  const clean = sanitizePublishingText(description);
  const withoutOldFooter = clean
    .replace(/Join the conversation:[\s\S]*$/i, '')
    .replace(/Rekkrd After Dark is a mood-music companion[\s\S]*$/i, '')
    .replace(/Chapters:[\s\S]*?(?=Content note:|How this was made|Subscribe for more long-form|$)/i, '')
    .replace(/Content note:[\s\S]*$/i, '')
    .replace(/How this was made[\s\S]*$/i, '')
    .replace(/Subscribe for more long-form[\s\S]*$/i, '')
    .trim();
  return [withoutOldFooter, publishingFooter(title, chapters)]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4900)
    .trim();
}

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
  let q = supabase.from('trellis_episodes').select('*').order('updated_at', { ascending: false }).limit(limit);
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

export async function getYouTubeMetrics(episodeId: string, limit = 30): Promise<YouTubeDailyMetric[]> {
  const { data, error } = await supabase
    .from('trellis_youtube_daily_metrics')
    .select('*')
    .eq('episode_id', episodeId)
    .order('metric_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load YouTube analytics: ${error.message}`);
  return (data as YouTubeDailyMetric[]) ?? [];
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

export type ArtworkAlcoholPolicy = 'allow' | 'exclude';

// ─── Artwork (Gemini scene → image model → episode-assets) ──────────
export async function generateArtwork(
  episode: Episode,
  assetType: AssetType,
  extraPrompt?: string,
  style?: EpisodeArtStyle,
  alcoholPolicy: ArtworkAlcoholPolicy = 'allow',
): Promise<EpisodeAsset> {
  const dims = ASSET_DIMS[assetType] ?? { width: 1920, height: 1080 };
  const cleanTheme = sanitizeArtworkText(episode.theme);
  const cleanPrompt = sanitizeArtworkText(`${episode.show_name ? episode.show_name + '. ' : ''}${extraPrompt || ''}`.trim());
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
      title: sanitizeArtworkText(episode.title), theme: cleanTheme,
      prompt: cleanPrompt,
      alcohol_policy: alcoholPolicy,
      allow_alcohol: alcoholPolicy === 'allow',
      ...(style ? { style_prompt: style.prompt, setting: style.setting } : {}),
    },
  }).catch(() => {});
  await setEpisodeStatus(episode.id, 'artwork');
  return asset as EpisodeAsset;
}

// ─── Bring-your-own artwork (upload an image made outside the app) ───
// Reuses the save-episode-asset edge fn: uploads the PNG to episode-assets and
// records a ready asset row for the given slot (cover_art / thumbnail / vertical).
export async function uploadEpisodeImage(episodeId: string, assetType: AssetType, imageBase64: string, width: number, height: number): Promise<void> {
  const { data, error } = await supabase.functions.invoke('save-episode-asset', {
    body: { episode_id: episodeId, asset_type: assetType, image_base64: imageBase64, width, height, metadata: { uploaded: true } },
  });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || 'Upload failed');
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

  const cleanEpisodeTitle = sanitizePublishingTitle(episode.title, episode.show_name);
  const cleanShowName = sanitizePublishingText(episode.show_name);
  const cleanTheme = sanitizePublishingText(episode.theme);
  const cleanGenre = sanitizePublishingText(session?.genre || 'music') || 'music';
  const cleanMood = sanitizePublishingText(session?.mood || '');

  let title = cleanEpisodeTitle, description = '', tags: string[] = [], hashtags: string[] = [];
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `Write YouTube publishing metadata for a ${cleanGenre} ${cleanMood} session titled "${cleanEpisodeTitle}"${cleanShowName ? ` for the show "${cleanShowName}"` : ''}. Theme: ${cleanTheme || 'n/a'}.
Keep the title readable and do not repeat the show name twice.
Avoid smoking references and avoid the words smoky, romantic, sensual, and intimate.
Write the description in an editorial, cinematic style: setting, mood, instruments, listener scenario, and emotional arc. Avoid generic SEO filler.
Do not include AI disclosure, production notes, hashtags, or chapter text in the description; the app adds those separately.
Return ONLY raw JSON, no markdown:
{"title":"catchy SEO title","description":"long SEO description (audience, style, what to expect)","tags":["12-15 short search tags"],"hashtags":["6-10 #hashtags"]}`;
      const resp = await ai.models.generateContent({ model: META_MODEL, contents: prompt });
      const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const j = JSON.parse(raw);
      title = sanitizePublishingTitle(j.title || title, cleanShowName);
      description = sanitizePublishingText(j.description || '');
      tags = sanitizePublishingList(j.tags);
      hashtags = sanitizePublishingList(j.hashtags).map(h => h.startsWith('#') ? h : `#${h.replace(/^#+/, '')}`);
    } catch (e) { console.warn('[episodes] metadata gen failed, using minimal fallback', e); }
  }
  title = sanitizePublishingTitle(title, cleanShowName);
  description = withPublishingFooter(description, title, chapters);
  tags = sanitizeYoutubeTags(tags);
  hashtags = hashtags.map(h => {
    const clean = sanitizePublishingText(h).replace(/\s+/g, '');
    return clean ? (clean.startsWith('#') ? clean : `#${clean.replace(/^#+/, '')}`) : '';
  }).filter(Boolean);

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
export async function publishEpisode(
  episode: Episode,
  platform: PublishPlatform,
  videoUrl: string | null,
  metadata: EpisodeMetadata | null,
  thumbnailUrl?: string | null,
  youtubeAccountId?: string | null,
): Promise<EpisodePublication> {
  if (platform === 'youtube' && !youtubeAccountId) throw new Error('Choose an active YouTube channel before publishing.');
  const { data: pub, error } = await supabase.from('trellis_episode_publications').insert({
    episode_id: episode.id, platform, status: 'pending', youtube_account_id: platform === 'youtube' ? youtubeAccountId : null,
  }).select('*').single();
  if (error || !pub) throw new Error(`Could not create publication: ${error?.message}`);

  fetch(EPISODE_PUBLISH_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publication_id: pub.id, episode_id: episode.id, branch: episode.branch, platform,
      youtube_account_id: platform === 'youtube' ? youtubeAccountId : null,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl || null,
      made_for_kids: false,
      contains_synthetic_media: true,
      engagement_comment: engagementComment(metadata?.title || episode.title),
      metadata: metadata ? {
        title: metadata.title, description: withPublishingFooter(metadata.description || '', metadata.title || episode.title, metadata.chapters),
        tags: sanitizeYoutubeTags(metadata.tags), chapters: metadata.chapters, hashtags: metadata.hashtags,
      } : null,
    }),
  }).catch(() => {});
  await setEpisodeStatus(episode.id, 'publishing');
  return pub as EpisodePublication;
}

export async function markPublicationFailed(publication: EpisodePublication, reason: string): Promise<void> {
  const response = {
    ...(publication.response || {}),
    reason,
    reset_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('trellis_episode_publications')
    .update({
      status: 'failed',
      response,
      updated_at: new Date().toISOString(),
    })
    .eq('id', publication.id);
  if (error) throw new Error(`Could not reset publication: ${error.message}`);

  await setEpisodeStatus(publication.episode_id, 'metadata');
}

export async function archiveEpisode(id: string): Promise<void> {
  await supabase.from('trellis_episodes').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
}

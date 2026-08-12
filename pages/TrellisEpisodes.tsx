import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clapperboard, Loader2, RefreshCw, Plus, Music, Image as ImageIcon, Film, FileText, Send,
  CheckCircle2, Archive, Link2, Download, Wand2, ExternalLink, Upload, RotateCw, Activity,
  AlertCircle, Copy, BarChart3,
} from 'lucide-react';
import {
  Branch, BranchSocialAccountsMap, Episode, EpisodeAsset, EpisodeMetadata, EpisodePublication, CreateEpisodeConfig, AssetType, MusicSession, PublishPlatform, YouTubeDailyMetric,
} from '../types';
import { EPISODE_PHASES, EPISODE_STATUS_META, PUBLISH_PLATFORMS, EPISODE_ART_STYLES } from '../constants';
import {
  createEpisode, getEpisodes, getEpisode, getAssets, getMetadata, getPublications,
  linkSession, setEpisodeStatus, setAssetApproved, getSessionMasterUrl,
  generateArtwork, buildVideo, generateMetadata, approveMetadata, publishEpisode, archiveEpisode, uploadEpisodeImage,
  markPublicationFailed, getYouTubeMetrics,
} from '../services/episodeService';
import { getSessions, getSession } from '../services/sessionService';
import TitledThumbnailComposer from '../components/TitledThumbnailComposer';
import YouTubeAccountSelector from '../components/YouTubeAccountSelector';

interface Props {
  branches: Branch[];
  branchSocialAccounts: BranchSocialAccountsMap;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
  geminiApiKey?: string;
}

const card = 'bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';
const phaseHead = 'text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2';
type EpisodeListTab = 'ready' | 'review' | 'archived';
const EPISODE_PAGE_SIZE = 8;
const STUCK_PUBLICATION_MINUTES = 10;
const YOUTUBE_SEARCH_TERMS = [
  'jazz', 'smooth jazz', 'instrumental jazz', 'relaxing jazz', 'focus', 'study',
  'work', 'reading', 'dinner', 'lounge', 'coffee', 'midnight', 'night',
];
const PUBLISH_WORDING_FLAGS = ['smoky', 'smoking', 'cigarette', 'cigar', 'tobacco', 'romantic', 'sensual', 'intimate'];

type ChecklistStatus = 'pass' | 'warn' | 'todo';
type ChecklistItem = { label: string; detail: string; status: ChecklistStatus };

function episodeInTab(episode: Episode, tab: EpisodeListTab): boolean {
  if (tab === 'ready') return episode.status === 'published';
  if (tab === 'archived') return episode.status === 'archived';
  return episode.status !== 'published' && episode.status !== 'archived';
}

function formatEpisodeDate(value?: string | null): string {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPublicationStamp(pub: EpisodePublication): string {
  const label = pub.status === 'live' ? 'Live' : pub.status === 'failed' ? 'Failed' : 'Pushed';
  const value = pub.status === 'live'
    ? pub.published_at || pub.updated_at || pub.created_at
    : pub.status === 'failed'
      ? pub.updated_at || pub.created_at
      : pub.created_at;
  return `${label} ${formatEpisodeDate(value)}`;
}

function hasSearchTerm(value?: string | null): boolean {
  const text = (value || '').toLowerCase();
  return YOUTUBE_SEARCH_TERMS.some(term => text.includes(term));
}

function hasFlaggedPublishWording(value?: string | null): boolean {
  const text = (value || '').toLowerCase();
  return PUBLISH_WORDING_FLAGS.some(term => text.includes(term));
}

function minutesSince(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function formatAge(value?: string | null): string {
  const mins = minutesSince(value);
  if (mins === null) return 'unknown';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}

function formatElapsed(value?: string | null): string {
  const mins = minutesSince(value);
  if (mins === null) return 'unknown';
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatMetricNumber(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value));
}

function formatWatchHours(minutes?: number | null): string {
  const hours = Number(minutes || 0) / 60;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: hours >= 10 ? 0 : 1 }).format(hours);
}

function formatDurationSeconds(seconds?: number | null): string {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

type WorkerInfo = {
  stage?: string;
  message?: string;
  heartbeat_at?: string;
  progress?: number;
  rendered_seconds?: number;
  duration_seconds?: number;
  file_size_mb?: number;
};

function getWorkerInfo(asset?: EpisodeAsset | null): WorkerInfo | null {
  const worker = asset?.metadata?.worker;
  return worker && typeof worker === 'object' ? worker as WorkerInfo : null;
}

function isPublicationInFlight(pub: EpisodePublication): boolean {
  return pub.status === 'pending' || pub.status === 'uploading' || pub.status === 'processing';
}

function isPublicationStuck(pub: EpisodePublication): boolean {
  const age = minutesSince(pub.updated_at || pub.created_at);
  return isPublicationInFlight(pub) && age !== null && age >= STUCK_PUBLICATION_MINUTES;
}

const TrellisEpisodes: React.FC<Props> = ({ branches, branchSocialAccounts, addToast, userId, geminiApiKey }) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selected, setSelected] = useState<Episode | null>(null);
  const [assets, setAssets] = useState<EpisodeAsset[]>([]);
  const [metadata, setMetadata] = useState<EpisodeMetadata | null>(null);
  const [pubs, setPubs] = useState<EpisodePublication[]>([]);
  const [youtubeAccountId, setYoutubeAccountId] = useState('');
  const [youtubeMetrics, setYoutubeMetrics] = useState<YouTubeDailyMetric[]>([]);
  const [sessionsList, setSessionsList] = useState<MusicSession[]>([]);
  const [linkedSession, setLinkedSession] = useState<MusicSession | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [episodeTab, setEpisodeTab] = useState<EpisodeListTab>('review');
  const [episodePage, setEpisodePage] = useState(1);
  const [artStyleId, setArtStyleId] = useState(EPISODE_ART_STYLES[0].id);
  const [artworkAlcoholPolicy, setArtworkAlcoholPolicy] = useState<'allow' | 'exclude'>('allow');
  const [videoMotion, setVideoMotion] = useState<'ken_burns' | 'none'>('ken_burns');

  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [title, setTitle] = useState('');
  const [showName, setShowName] = useState('');
  const [theme, setTheme] = useState('');
  const [linkChoice, setLinkChoice] = useState('');

  useEffect(() => { if (!branch && branches[0]) setBranch(branches[0].slug); }, [branches, branch]);

  const loadEpisodes = useCallback(async () => {
    try { setLoading(true); setEpisodes(await getEpisodes(undefined, 50)); }
    catch (e) { addToast(`Failed to load episodes: ${msg(e)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { loadEpisodes(); }, [loadEpisodes]);

  const loadDetail = useCallback(async (ep: Episode) => {
    const [a, m, p, y] = await Promise.all([getAssets(ep.id), getMetadata(ep.id), getPublications(ep.id), getYouTubeMetrics(ep.id).catch(() => [])]);
    setAssets(a); setMetadata(m); setPubs(p); setYoutubeMetrics(y);
    if (ep.session_id) {
      const [s, url] = await Promise.all([getSession(ep.session_id), getSessionMasterUrl(ep.session_id)]);
      setLinkedSession(s); setMasterUrl(url);
    } else { setLinkedSession(null); setMasterUrl(null); }
  }, []);

  const select = useCallback(async (ep: Episode) => {
    setSelected(ep); setAssets([]); setMetadata(null); setPubs([]); setYoutubeMetrics([]); setLinkedSession(null); setMasterUrl(null);
    try {
      const sessions = await getSessions(ep.branch || undefined, 50);
      setSessionsList(sessions.filter(s => s.status !== 'archived'));
    } catch { /* ignore */ }
    await loadDetail(ep);
  }, [loadDetail]);

  // Poll while assets or publications are in flight
  const pollRef = useRef<number | null>(null);
  const active = useMemo(() =>
    assets.some(a => a.status === 'queued' || a.status === 'processing') ||
    pubs.some(isPublicationInFlight),
  [assets, pubs]);
  useEffect(() => {
    if (!selected || !active) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    pollRef.current = window.setInterval(async () => {
      const [a, p, ep] = await Promise.all([getAssets(selected.id), getPublications(selected.id), getEpisode(selected.id)]);
      setAssets(a); setPubs(p);
      if (!ep) return;
      // A publication went live → advance the episode to 'published' (once)
      if (p.some(x => x.status === 'live') && ep.status === 'publishing') {
        setEpisodeStatus(ep.id, 'published').catch(() => {});
        const done = { ...ep, status: 'published' as const };
        setSelected(done); setEpisodes(prev => prev.map(x => x.id === ep.id ? done : x));
      } else {
        setSelected(ep); setEpisodes(prev => prev.map(x => x.id === ep.id ? ep : x));
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [selected, active]);

  // Newest wins: sort by version, then created_at so a fresh regenerate/upload shows.
  const latest = (type: AssetType) => assets.filter(a => a.asset_type === type)
    .sort((x, y) => (y.version - x.version) || (new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime()))[0];
  const cover = latest('cover_art');
  const thumbnail = latest('thumbnail');
  const video = latest('video_mp4');
  const publishThumbnailUrl = thumbnail?.status === 'ready' && thumbnail.url
    ? thumbnail.url
    : cover?.status === 'ready' && cover.url
      ? cover.url
      : null;
  const videoWorker = getWorkerInfo(video);
  const videoDurationSeconds = video?.duration_seconds ?? videoWorker?.duration_seconds ?? null;
  const videoNeedsYouTubeLongUploadAccess = typeof videoDurationSeconds === 'number' && videoDurationSeconds > 900;
  const metadataText = [metadata?.title, metadata?.description, ...(metadata?.tags || []), ...(metadata?.hashtags || [])].filter(Boolean).join(' ');
  const seoChecklist: ChecklistItem[] = [
    {
      label: 'Metadata approved',
      detail: metadata?.status === 'approved' ? 'Ready for publishing.' : metadata ? 'Review and approve metadata before publishing.' : 'Generate metadata first.',
      status: metadata?.status === 'approved' ? 'pass' : 'todo',
    },
    {
      label: 'Searchable title',
      detail: metadata?.title
        ? hasSearchTerm(metadata.title) ? 'Title includes search language people already use.' : 'Add plain words like smooth jazz, relaxing jazz, focus, study, or lounge.'
        : 'Needs a YouTube title.',
      status: metadata?.title && hasSearchTerm(metadata.title) ? 'pass' : 'todo',
    },
    {
      label: 'Clean wording',
      detail: hasFlaggedPublishWording(metadataText) ? 'Regenerate or edit metadata to remove smoking/romance terms.' : 'No flagged wording found.',
      status: metadataText && !hasFlaggedPublishWording(metadataText) ? 'pass' : 'todo',
    },
    {
      label: 'Description depth',
      detail: (metadata?.description || '').length >= 180 ? 'Enough description text for search context.' : 'Use a fuller description with mood, use case, and listening context.',
      status: (metadata?.description || '').length >= 180 ? 'pass' : 'todo',
    },
    {
      label: 'Tags and hashtags',
      detail: (metadata?.tags?.length || 0) >= 8 && (metadata?.hashtags?.length || 0) >= 3 ? 'Tags and hashtags are filled in.' : 'Aim for at least 8 tags and 3 hashtags.',
      status: (metadata?.tags?.length || 0) >= 8 && (metadata?.hashtags?.length || 0) >= 3 ? 'pass' : 'todo',
    },
    {
      label: 'Cover and video',
      detail: cover?.status === 'ready' && video?.status === 'ready' ? 'Visual and final MP4 are ready.' : 'Finish cover art and video render before publishing.',
      status: cover?.status === 'ready' && video?.status === 'ready' ? 'pass' : 'todo',
    },
    {
      label: 'Long-video access',
      detail: videoNeedsYouTubeLongUploadAccess ? 'Confirm YouTube Intermediate features are enabled for 15+ minute uploads.' : 'No long-video account gate expected.',
      status: videoNeedsYouTubeLongUploadAccess ? 'warn' : 'pass',
    },
  ];
  const seoRequiredItems = seoChecklist.filter(item => item.status !== 'warn');
  const seoPassedItems = seoRequiredItems.filter(item => item.status === 'pass').length;
  const seoReady = seoPassedItems === seoRequiredItems.length;
  const latestYoutubeMetric = youtubeMetrics[0];
  const sevenDayYoutubeMetrics = youtubeMetrics.slice(0, 7);
  const sevenDayViews = sevenDayYoutubeMetrics.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const sevenDayWatchMinutes = sevenDayYoutubeMetrics.reduce((sum, row) => sum + Number(row.estimated_minutes_watched || 0), 0);
  const latestPublicStats = latestYoutubeMetric?.raw?.public_statistics as Record<string, unknown> | undefined;
  const totalYouTubeViews = latestPublicStats?.viewCount != null ? Number(latestPublicStats.viewCount) : null;
  const youtubeLivePublication = pubs.find(p => p.platform === 'youtube' && p.status === 'live');
  const episodeTabCounts: Record<EpisodeListTab, number> = {
    ready: episodes.filter(ep => episodeInTab(ep, 'ready')).length,
    review: episodes.filter(ep => episodeInTab(ep, 'review')).length,
    archived: episodes.filter(ep => episodeInTab(ep, 'archived')).length,
  };
  const filteredEpisodes = episodes.filter(ep => episodeInTab(ep, episodeTab));
  const episodePageCount = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODE_PAGE_SIZE));
  const visibleEpisodes = filteredEpisodes.slice((episodePage - 1) * EPISODE_PAGE_SIZE, episodePage * EPISODE_PAGE_SIZE);

  useEffect(() => {
    setEpisodePage(1);
  }, [episodeTab]);

  useEffect(() => {
    setEpisodePage(page => Math.min(page, episodePageCount));
  }, [episodePageCount]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      if (selected) {
        const fresh = await getEpisode(selected.id);
        if (fresh) {
          setSelected(fresh);
          setEpisodes(prev => prev.map(ep => ep.id === fresh.id ? fresh : ep));
          await loadDetail(fresh);
        } else {
          await loadDetail(selected);
        }
      }
    }
    catch (e) { addToast(msg(e), 'error'); }
    finally { setBusy(''); }
  };

  const copyPublicationUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      addToast('Publish link copied.', 'success');
    } catch {
      addToast('Could not copy the link from the browser.', 'error');
    }
  };

  // Upload your own artwork (created outside the app): normalize to PNG in a canvas,
  // then store it in the chosen slot via the save-episode-asset edge fn.
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<AssetType>('cover_art');
  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    const ep = selected;
    run(`upload-${uploadType}`, () => new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          await uploadEpisodeImage(ep.id, uploadType, c.toDataURL('image/png'), img.naturalWidth, img.naturalHeight);
          resolve();
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('Could not read that image file'));
      img.src = URL.createObjectURL(file);
    }));
  };

  const handleCreate = async () => {
    if (!branch || !title.trim()) { addToast('Branch and title required', 'error'); return; }
    setBusy('create');
    try {
      const ep = await createEpisode({ branch, title: title.trim(), show_name: showName || undefined, theme: theme || undefined } as CreateEpisodeConfig, userId);
      setEpisodes(prev => [ep, ...prev]); setTitle(''); await select(ep);
      addToast(`Episode "${ep.title}" created`, 'success');
    } catch (e) { addToast(msg(e), 'error'); } finally { setBusy(''); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
      {/* Left: create + list */}
      <div className="lg:col-span-1 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center"><Clapperboard className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Trellis Episodes</h2>
            <p className="text-[11px] text-slate-400 font-medium">AI content production pipeline</p>
          </div>
        </div>

        <div className={`${card} space-y-4`}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> New Episode</h3>
          <div><label className={labelCls}>Branch</label>
            <select className={inputCls} value={branch} onChange={e => setBranch(e.target.value)}>
              {branches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Episode Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Late Night Jazz for Vinyl Lovers" />
          </div>
          <div><label className={labelCls}>Show / Brand</label>
            <input className={inputCls} value={showName} onChange={e => setShowName(e.target.value)} placeholder="Rekkrd After Dark" />
          </div>
          <div><label className={labelCls}>Theme</label>
            <input className={inputCls} value={theme} onChange={e => setTheme(e.target.value)} placeholder="moody late-night instrumental jazz lounge" />
          </div>
          <button type="button" onClick={handleCreate} disabled={busy === 'create' || !branch || !title.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-50">
            {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />} Create Episode
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Episodes</h3>
            <button onClick={loadEpisodes} className="text-slate-400 hover:text-emerald-600 transition"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-xl p-1">
            {(['ready', 'review', 'archived'] as EpisodeListTab[]).map(tab => (
              <button key={tab} type="button" onClick={() => setEpisodeTab(tab)}
                className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${episodeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {tab} ({episodeTabCounts[tab]})
              </button>
            ))}
          </div>
          {filteredEpisodes.length === 0 && !loading ? <p className="text-xs text-slate-400 px-1 py-4">No {episodeTab} episodes.</p> :
            visibleEpisodes.map(ep => {
              const m = EPISODE_STATUS_META[ep.status] || EPISODE_STATUS_META.draft;
              return (
                <button key={ep.id} type="button" onClick={() => select(ep)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition ${selected?.id === ep.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-800 text-xs truncate">{ep.title}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.cls}`}>{m.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">{ep.show_name || 'No show'}</p>
                  <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest mt-1">Updated {formatEpisodeDate(ep.updated_at)}</p>
                  {ep.created_at !== ep.updated_at && (
                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">Created {formatEpisodeDate(ep.created_at)}</p>
                  )}
                </button>
              );
            })}
          {filteredEpisodes.length > EPISODE_PAGE_SIZE && (
            <div className="flex items-center justify-between px-1 pt-1">
              <button type="button" disabled={episodePage <= 1} onClick={() => setEpisodePage(p => Math.max(1, p - 1))}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:text-emerald-600">Prev</button>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Page {episodePage} / {episodePageCount}</span>
              <button type="button" disabled={episodePage >= episodePageCount} onClick={() => setEpisodePage(p => Math.min(episodePageCount, p + 1))}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:text-emerald-600">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Right: pipeline */}
      <div className="lg:col-span-2">
        {!selected ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-[2rem] border border-slate-100">
            <Clapperboard size={44} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">Select or create an episode</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">An episode runs the full pipeline: music → master → artwork → video → metadata → publish. Music is the first asset; everything else attaches here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header + stepper */}
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selected.title}</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">{[selected.show_name, selected.theme].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <button type="button" onClick={() => run('archive', () => archiveEpisode(selected.id).then(() => setEpisodes(p => p.map(x => x.id === selected.id ? { ...x, status: 'archived' } : x))))}
                  className="px-3 py-2 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition flex items-center gap-1"><Archive size={13} /> Archive</button>
              </div>
              <div className="flex items-center gap-1 mt-5 overflow-x-auto">
                {EPISODE_PHASES.map((ph, i) => {
                  const order = EPISODE_PHASES.map(p => p.key);
                  const curIdx = order.indexOf(selected.status as typeof order[number]);
                  const done = curIdx > i || selected.status === 'published';
                  const cur = order[i] === selected.status;
                  return (
                    <React.Fragment key={ph.key}>
                      {i > 0 && <div className={`h-0.5 w-5 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${cur ? 'bg-slate-900 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {done && <CheckCircle2 size={10} />}{ph.label}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Phase 1: Music */}
            <div className={card}>
              <h4 className={phaseHead}><Music size={15} className="text-amber-500" /> Music Session</h4>
              {linkedSession ? (
                <p className="text-xs text-slate-500 mt-3">Linked: <b className="text-slate-800">{linkedSession.title}</b> ({linkedSession.status})</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <select className={inputCls} value={linkChoice} onChange={e => setLinkChoice(e.target.value)}>
                    <option value="">Select a session…</option>
                    {sessionsList.map(s => <option key={s.id} value={s.id}>{s.title} ({s.status})</option>)}
                  </select>
                  <button type="button" disabled={!linkChoice || busy === 'link'} onClick={() => run('link', () => linkSession(selected.id, linkChoice).then(() => setSelected(p => p ? { ...p, session_id: linkChoice, status: 'master' } : p)))}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-600 transition disabled:opacity-40 shrink-0"><Link2 size={13} /> Link</button>
                </div>
              )}
            </div>

            {/* Phase 2: Master */}
            <div className={card}>
              <h4 className={phaseHead}><Music size={15} className="text-blue-500" /> Master Audio</h4>
              {masterUrl ? (
                <div className="mt-3 space-y-2">
                  <audio controls src={masterUrl} className="w-full" />
                  <div className="flex gap-2">
                    <a href={masterUrl} download className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={13} /> MP3</a>
                    <span className="text-[10px] text-slate-400 italic">WAV master generated by the stitch worker (future)</span>
                  </div>
                </div>
              ) : <p className="text-xs text-slate-400 mt-3">No master yet — stitch approved tracks in the linked session first.</p>}
            </div>

            {/* Phase 3: Artwork */}
            <div className={card}>
              <h4 className={phaseHead}><ImageIcon size={15} className="text-violet-500" /> Artwork</h4>

              {/* Art style picker — drives the generator's look + scene setting */}
              <div className="mt-3">
                <label className={labelCls}>Art Style</label>
                <select value={artStyleId} onChange={e => setArtStyleId(e.target.value)} disabled={!!busy}
                  className={inputCls}>
                  {EPISODE_ART_STYLES.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.desc}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Drinks in Artwork</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['allow', 'Allow Drinks'],
                    ['exclude', 'No Drinks'],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" disabled={!!busy} onClick={() => setArtworkAlcoholPolicy(value)}
                      className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-tight transition disabled:opacity-40 ${
                        artworkAlcoholPolicy === value ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-slate-400 mt-3">Generate with AI — click again anytime for a fresh take — or upload your own below.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['cover_art', 'thumbnail', 'vertical'] as AssetType[]).map(t => {
                  const exists = !!latest(t);
                  return (
                    <button key={t} type="button" disabled={!!busy} onClick={() => run(`art-${t}`, () => generateArtwork(selected, t, undefined, EPISODE_ART_STYLES.find(s => s.id === artStyleId), artworkAlcoholPolicy).then(() => {}))}
                      className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100 text-[10px] font-black text-violet-600 uppercase tracking-tight hover:border-violet-400 transition disabled:opacity-40 flex items-center gap-1">
                      {exists ? <RotateCw size={11} /> : <Wand2 size={11} />} {exists ? 'Regen ' : ''}{t.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>

              {/* Bring your own image (created outside the app) */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Or upload</span>
                <select value={uploadType} onChange={e => setUploadType(e.target.value as AssetType)} disabled={!!busy}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none focus:border-slate-400">
                  {(['cover_art', 'thumbnail', 'vertical'] as AssetType[]).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
                <button type="button" disabled={!!busy} onClick={() => uploadFileRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-tight hover:bg-slate-900 transition disabled:opacity-40 flex items-center gap-1">
                  <Upload size={11} /> Upload Image
                </button>
                <input ref={uploadFileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadFile} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['cover_art', 'thumbnail', 'vertical'] as AssetType[]).map(t => {
                  const a = latest(t);
                  if (!a) return <div key={t} className="aspect-video rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-300 uppercase">{t.replace('_', ' ')}</div>;
                  return (
                    <div key={t} className="relative rounded-xl overflow-hidden border border-slate-200">
                      {a.status === 'ready' && a.url ? <img src={`${a.url}?v=${a.id}`} alt={t} className="w-full aspect-video object-cover" /> :
                        <div className="w-full aspect-video bg-slate-50 flex items-center justify-center">{a.status === 'failed' ? <span className="text-[9px] text-rose-500 font-black">FAILED</span> : <Loader2 size={16} className="animate-spin text-slate-400" />}</div>}
                      {a.status === 'ready' && (
                        <button type="button" onClick={() => run('approve-art', () => setAssetApproved(a.id, !a.approved))}
                          className={`absolute bottom-1 right-1 px-2 py-0.5 rounded text-[8px] font-black uppercase ${a.approved ? 'bg-emerald-600 text-white' : 'bg-white/90 text-slate-600'}`}>{a.approved ? '✓' : 'approve'}</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Titled thumbnail composer — clean type overlay on the cover (not AI text) */}
              {cover?.status === 'ready' && cover.url && (
                <TitledThumbnailComposer
                  episodeId={selected.id}
                  coverUrl={`${cover.url}?v=${cover.id}`}
                  defaultTitle={selected.title}
                  defaultSubtitle={selected.show_name || selected.theme || ''}
                  onSaved={() => loadDetail(selected)}
                />
              )}
            </div>

            {/* Phase 4: Video */}
            <div className={card}>
              <h4 className={phaseHead}><Film size={15} className="text-indigo-500" /> Video</h4>

              {/* Motion: Ken Burns (slow zoom) or a plain static image */}
              <div className="mt-3 flex gap-2">
                {([['ken_burns', 'Ken Burns (slow zoom)'], ['none', 'Static (no movement)']] as const).map(([m, label]) => (
                  <button key={m} type="button" disabled={!!busy} onClick={() => setVideoMotion(m)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight transition disabled:opacity-40 ${
                      videoMotion === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <button type="button" disabled={!masterUrl || !!busy} onClick={() => run('video', () => buildVideo(selected, masterUrl!, cover?.url || null, videoMotion).then(() => {}))}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-indigo-700 transition disabled:opacity-40">
                  <Film size={13} /> Build Video (master + cover)
                </button>
                {!masterUrl && <span className="ml-2 text-[10px] text-slate-400">needs a master</span>}
              </div>
              {video && (
                <div className="mt-3">
                  {video.status === 'ready' && video.url ? (
                    <div className="space-y-2">
                      <video controls src={video.url} className="w-full rounded-xl bg-black" />
                      <a href={video.url} download className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={13} /> MP4</a>
                    </div>
                  ) : video.status === 'failed' ? (
                    <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-3">
                      <span className="font-medium">{video.error_message || 'Video render failed.'}</span>
                    </div>
                  ) : (() => {
                    const worker = getWorkerInfo(video);
                    const progress = typeof worker?.progress === 'number' ? worker.progress : null;
                    const lastUpdate = worker?.heartbeat_at || video.updated_at;
                    const heartbeatMins = minutesSince(lastUpdate);
                    const stale = heartbeatMins !== null && heartbeatMins >= 15;
                    return (
                      <div className={`rounded-xl p-3 border ${stale ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                        <div className="flex items-start gap-2">
                          {stale ? <Activity size={14} className="mt-0.5 shrink-0" /> : <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-widest">
                                {worker?.message || (video.status === 'queued' ? 'Waiting for worker' : 'Rendering video')}
                              </p>
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{video.status}</span>
                            </div>
                            {progress !== null && (
                              <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-bold opacity-80">
                              <span>Elapsed: {formatElapsed(video.created_at)}</span>
                              <span>Last update: {formatAge(lastUpdate)}</span>
                              <span>{progress !== null ? `Progress: ${Math.round(progress)}%` : `Stage: ${worker?.stage || video.status}`}</span>
                            </div>
                            {worker?.rendered_seconds != null && worker?.duration_seconds != null && (
                              <p className="mt-1 text-[10px] font-medium opacity-70">
                                Rendered {Math.round(worker.rendered_seconds)}s of {Math.round(worker.duration_seconds)}s.
                              </p>
                            )}
                            {stale && (
                              <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                                No heartbeat for 15+ minutes. Check the video worker before starting another render.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Phase 5: Metadata */}
            <div className={card}>
              <h4 className={phaseHead}><FileText size={15} className="text-cyan-500" /> Metadata</h4>
              <button type="button" disabled={!!busy} onClick={() => run('meta', () => generateMetadata(selected, linkedSession, geminiApiKey || '').then(() => {}))}
                className="mt-3 px-4 py-2 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-cyan-700 transition disabled:opacity-40">
                {busy === 'meta' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Generate Metadata
              </button>
              {metadata && (
                <div className="mt-3 space-y-2 text-xs">
                  <div><span className={labelCls}>Title</span><p className="font-bold text-slate-800">{metadata.title}</p></div>
                  {metadata.description && <div><span className={labelCls}>Description</span><p className="text-slate-600 whitespace-pre-wrap line-clamp-4">{metadata.description}</p></div>}
                  {metadata.chapters?.length > 0 && <div><span className={labelCls}>Chapters</span><p className="text-slate-600 font-mono text-[11px]">{metadata.chapters.map(c => `${c.time} ${c.title}`).join('  ·  ')}</p></div>}
                  {metadata.tags?.length > 0 && <div className="flex flex-wrap gap-1">{metadata.tags.slice(0, 30).map((t, i) => <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500">{t}</span>)}</div>}
                  {metadata.hashtags?.length > 0 && <p className="text-[11px] font-bold text-cyan-600">{metadata.hashtags.join(' ')}</p>}
                  <button type="button" onClick={() => run('approve-meta', () => approveMetadata(selected.id))}
                    className={`mt-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${metadata.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {metadata.status === 'approved' ? '✓ Approved' : 'Approve Metadata'}
                  </button>
                </div>
              )}
            </div>

            {/* Phase 6: Publish */}
            <div className={card}>
              <h4 className={phaseHead}><Send size={15} className="text-emerald-500" /> Publish</h4>
              <div className="mt-3">
                <YouTubeAccountSelector branchSlug={selected.branch} branches={branches} accountsByBranch={branchSocialAccounts} value={youtubeAccountId} onChange={setYoutubeAccountId} disabled={!!busy} />
              </div>
              <div className={`mt-3 rounded-2xl border p-3 ${seoReady ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">YouTube SEO checklist</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {seoPassedItems}/{seoRequiredItems.length} essentials ready
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${seoReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {seoReady ? 'Ready' : 'Review'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {seoChecklist.map(item => {
                    const pass = item.status === 'pass';
                    const warn = item.status === 'warn';
                    const tone = pass
                      ? 'border-emerald-100 bg-white text-emerald-700'
                      : warn
                        ? 'border-amber-100 bg-white text-amber-700'
                        : 'border-slate-200 bg-white text-slate-500';
                    return (
                      <div key={item.label} className={`rounded-xl border p-2.5 ${tone}`}>
                        <div className="flex items-start gap-2">
                          {pass ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
                            <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-500">{item.detail}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {PUBLISH_PLATFORMS.map(p => (
                  <button key={p.id} type="button" disabled={!p.available || !!busy || (p.id === 'youtube' && !youtubeAccountId)}
                    onClick={() => run(`pub-${p.id}`, () => publishEpisode(selected, p.id as PublishPlatform, video?.url || null, metadata, publishThumbnailUrl, youtubeAccountId).then(() => {}))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[10px] font-black text-emerald-700 uppercase tracking-tight hover:border-emerald-400 transition disabled:opacity-40 flex items-center gap-1">
                    <Send size={11} /> {p.label}{!p.available && ' (soon)'}
                  </button>
                ))}
              </div>
              {pubs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {pubs.map(p => (
                    (() => {
                      const stuck = isPublicationStuck(p);
                      const age = formatAge(p.updated_at || p.created_at);
                      const reason = typeof p.response?.reason === 'string' ? p.response.reason : '';
                      return (
                        <div key={p.id} className={`flex items-center justify-between gap-3 text-xs rounded-xl px-3 py-2 ${stuck ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50'}`}>
                          <span className="min-w-0">
                            <span className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">{p.platform}</span>
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatPublicationStamp(p)}</span>
                            {isPublicationInFlight(p) && (
                              <span className={`mt-0.5 block text-[10px] font-black uppercase tracking-widest ${stuck ? 'text-rose-600' : 'text-amber-600'}`}>
                                {stuck ? `Stuck: no update for ${age}` : `Working: updated ${age}`}
                              </span>
                            )}
                            {reason && <span className="mt-0.5 block text-[10px] font-medium text-rose-600">{reason}</span>}
                            {p.external_url && (
                              <a href={p.external_url} target="_blank" rel="noreferrer"
                                className="mt-1 block max-w-[220px] truncate text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                                title={p.external_url}>
                                {p.external_url.replace(/^https?:\/\//, '')}
                              </a>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${p.status === 'live' ? 'bg-emerald-100 text-emerald-700' : p.status === 'failed' || stuck ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{stuck ? 'stuck' : p.status}</span>
                            {stuck && (
                              <button type="button" disabled={!!busy}
                                onClick={() => run(`reset-pub-${p.id}`, () => markPublicationFailed(p, `Publish stuck at ${p.status}; no update for ${age}. Check n8n execution logs, then retry.`))}
                                className="px-2 py-1 rounded-lg bg-rose-100 text-[9px] font-black uppercase tracking-widest text-rose-700 transition hover:bg-rose-200 disabled:opacity-40">
                                Reset
                              </button>
                            )}
                            {p.external_url && <a href={p.external_url} target="_blank" rel="noreferrer" className="text-emerald-600"><ExternalLink size={13} /></a>}
                            {p.external_url && (
                              <button type="button" onClick={() => copyPublicationUrl(p.external_url!)}
                                className="text-slate-400 transition hover:text-emerald-600" title="Copy publish link">
                                <Copy size={13} />
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>

            {/* YouTube Analytics */}
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className={phaseHead}><BarChart3 size={15} className="text-red-500" /> YouTube Analytics</h4>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    {latestYoutubeMetric ? `Last synced ${formatAge(latestYoutubeMetric.synced_at)}` : 'Waiting for the YouTube analytics sync.'}
                  </p>
                </div>
                <button type="button" onClick={() => selected && run('yt-metrics-refresh', () => getYouTubeMetrics(selected.id).then(setYoutubeMetrics))}
                  disabled={!!busy}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-200 disabled:opacity-40">
                  Refresh
                </button>
              </div>
              {!youtubeLivePublication ? (
                <p className="mt-3 text-xs font-medium text-slate-400">Publish this episode to YouTube first. Analytics will attach to the live publication.</p>
              ) : !latestYoutubeMetric ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">No analytics rows yet.</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">Next step is the scheduled YouTube sync job. Once it writes to <b>trellis_youtube_daily_metrics</b>, this panel will fill in automatically.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      ['Total Views', totalYouTubeViews != null ? formatMetricNumber(totalYouTubeViews) : formatMetricNumber(sevenDayViews)],
                      ['7-Day Watch', `${formatWatchHours(sevenDayWatchMinutes)} hr`],
                      ['Latest Avg View', formatDurationSeconds(latestYoutubeMetric.average_view_duration)],
                      ['Latest Retention', `${formatMetricNumber(latestYoutubeMetric.average_view_percentage)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className="mt-1 text-lg font-black text-slate-800">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      ['7-Day Views', formatMetricNumber(sevenDayViews)],
                      ['Latest Day', formatMetricNumber(latestYoutubeMetric.views)],
                      ['Total Likes', formatMetricNumber(latestYoutubeMetric.likes)],
                      ['Total Comments', formatMetricNumber(latestYoutubeMetric.comments)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-100 bg-white p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-black text-slate-700">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Video ID: {latestYoutubeMetric.youtube_video_id}</span>
                    <span>Metric date: {formatEpisodeDate(latestYoutubeMetric.metric_date)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function msg(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong'; }

export default TrellisEpisodes;

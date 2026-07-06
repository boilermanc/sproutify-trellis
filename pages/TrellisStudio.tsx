import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Music, Loader2, RefreshCw, Archive, AlertCircle, CheckCircle2, XCircle, Wand2,
  Sparkles, ListMusic, Layers, Download, Plus, Check, ArrowRight, Activity,
} from 'lucide-react';
import { MusicSession, MusicTrack, MusicRender, CreateSessionConfig } from '../types';
import {
  MUSIC_GENRES, MUSIC_MOODS, MUSIC_VOCALS, SESSION_PRESETS, SESSION_STATUS_META,
} from '../constants';
import {
  createSessionWithPlan, getSessions, getTracks, getRenders,
  generateSessionTracks, resumeSessionGeneration, setTrackApproved, regenerateTrack, stitchSession, archiveSession, updateSessionStatus,
} from '../services/sessionService';

interface TrellisStudioProps {
  branches: Array<{ slug: string; name: string }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
  geminiApiKey?: string;
  onNavigate?: (view: 'trellis-episodes') => void;
}

const TRACK_BADGE: Record<MusicTrack['status'], { label: string; cls: string; spin?: boolean }> = {
  planned: { label: 'Planned', cls: 'bg-slate-100 text-slate-500' },
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-600' },
  generating: { label: 'Generating', cls: 'bg-amber-100 text-amber-700', spin: true },
  completed: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
};

type SessionListTab = 'ready' | 'review' | 'archived';
const SESSION_PAGE_SIZE = 8;
const VOCAL_MIX_OPTIONS = ['Instrumental only', 'Female vocals', 'Male vocals', 'Duet'];

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function calculateTrackCount(targetMinutes: number, avgSeconds: number): number {
  return clampNumber(Math.round((targetMinutes * 60) / Math.max(15, avgSeconds)), 1, 24);
}

function calculateAvgSeconds(targetMinutes: number, tracks: number): number {
  return clampNumber(Math.round((targetMinutes * 60) / Math.max(1, tracks)), 15, 900);
}

function formatDurationMinutes(seconds: number): string {
  return `${(seconds / 60).toFixed(seconds % 60 === 0 ? 0 : 1)} min`;
}

function formatVocalMix(styles: string[]): string {
  const clean = styles.length ? styles : ['Instrumental only'];
  return clean.length === 1 ? clean[0] : `Mix: ${clean.join(', ')}`;
}

function summarizeTrackVocals(tracks: MusicTrack[]): string | null {
  const unique = Array.from(new Set(tracks.map(t => t.vocal_style).filter(Boolean) as string[]));
  return unique.length ? formatVocalMix(unique) : null;
}

function sessionInTab(session: MusicSession, tab: SessionListTab): boolean {
  if (tab === 'ready') return session.status === 'ready';
  if (tab === 'archived') return session.status === 'archived';
  return session.status !== 'ready' && session.status !== 'archived';
}

function formatSessionDate(value?: string | null): string {
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

function estimateTrackProgress(track: MusicTrack): number {
  if (track.status === 'completed') return 100;
  if (track.status === 'failed') return 100;
  if (track.status === 'queued') return 8;
  if (track.status !== 'generating') return 0;
  const mins = minutesSince(track.updated_at) ?? 0;
  return Math.min(95, 15 + (mins / 12) * 75);
}

type WorkerInfo = {
  stage?: string;
  message?: string;
  heartbeat_at?: string;
  progress?: number;
  stitched_tracks?: number;
  downloaded_tracks?: number;
  total_tracks?: number;
  duration_seconds?: number;
  file_size_mb?: number;
};

function getRenderWorkerInfo(render?: MusicRender | null): WorkerInfo | null {
  const worker = render?.metadata?.worker;
  return worker && typeof worker === 'object' ? worker as WorkerInfo : null;
}

const TrellisStudio: React.FC<TrellisStudioProps> = ({ branches, addToast, userId, geminiApiKey, onNavigate }) => {
  const [sessions, setSessions] = useState<MusicSession[]>([]);
  const [selected, setSelected] = useState<MusicSession | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [renders, setRenders] = useState<MusicRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionTab, setSessionTab] = useState<SessionListTab>('ready');
  const [sessionPage, setSessionPage] = useState(1);

  // Create form
  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [vocalStyles, setVocalStyles] = useState<string[]>([MUSIC_VOCALS[0]]);
  const [targetMinutes, setTargetMinutes] = useState(15);
  const [trackCount, setTrackCount] = useState<number | ''>(5);
  const [avgTrackSeconds, setAvgTrackSeconds] = useState(180);

  useEffect(() => { if (!branch && branches[0]) setBranch(branches[0].slug); }, [branches, branch]);

  const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';
  const plannedTrackCount = trackCount === '' ? calculateTrackCount(targetMinutes, avgTrackSeconds) : Number(trackCount);
  const plannedDurationSeconds = plannedTrackCount * avgTrackSeconds;
  const plannedDurationDeltaSeconds = plannedDurationSeconds - (targetMinutes * 60);
  const vocalStyle = formatVocalMix(vocalStyles);
  const selectedVocalSummary = summarizeTrackVocals(tracks);

  const loadSessions = useCallback(async () => {
    try { setLoading(true); setSessions(await getSessions(undefined, 50)); }
    catch (e) { addToast(`Failed to load sessions: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadDetail = useCallback(async (s: MusicSession) => {
    try {
      const [t, r] = await Promise.all([getTracks(s.id), getRenders(s.id)]);
      setTracks(t); setRenders(r);
    } catch (e) { addToast(`Failed to load session: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
  }, [addToast]);

  const selectSession = useCallback(async (s: MusicSession) => {
    setSelected(s); setTracks([]); setRenders([]);
    await loadDetail(s);
  }, [loadDetail]);

  // ── Polling: refetch detail while tracks generating or a render is in flight ──
  const pollRef = useRef<number | null>(null);
  const reportedFailureRef = useRef<Set<string>>(new Set());
  const activeWork = useMemo(() => {
    const trackActive = tracks.some(t => t.status === 'generating' || t.status === 'queued');
    const renderActive = renders.some(r => r.status === 'queued' || r.status === 'processing');
    return trackActive || renderActive || selected?.status === 'generating' || selected?.status === 'stitching';
  }, [tracks, renders, selected?.status]);

  useEffect(() => {
    if (!selected || !activeWork) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    pollRef.current = window.setInterval(async () => {
      const [t, r] = await Promise.all([getTracks(selected.id), getRenders(selected.id)]);
      setTracks(t); setRenders(r);
      // Render finished → session ready
      const active = r.find(x => x.status === 'queued' || x.status === 'processing');
      const ready = !active ? r.find(x => x.status === 'ready') : undefined;
      if (ready && selected.status !== 'ready') {
        setSelected(prev => prev ? { ...prev, status: 'ready', final_audio_url: ready.final_audio_url } : prev);
        setSessions(prev => prev.map(s => s.id === selected.id ? { ...s, status: 'ready', final_audio_url: ready.final_audio_url } : s));
      }
      // Render failed -> surface the worker error in the session UI.
      const failed = !active && !ready ? r.find(x => x.status === 'failed') : undefined;
      if (failed && selected.status !== 'failed') {
        const message = failed.error_message || 'Stitching failed';
        setSelected(prev => prev ? { ...prev, status: 'failed', error_message: message } : prev);
        setSessions(prev => prev.map(s => s.id === selected.id ? { ...s, status: 'failed', error_message: message } : s));
        if (!reportedFailureRef.current.has(failed.id)) {
          reportedFailureRef.current.add(failed.id);
          addToast(`Stitching failed: ${message}`, 'error');
        }
      }
      // All tracks done generating → move session to Review (once)
      const allDone = t.length > 0 && t.every(x => x.status === 'completed' || x.status === 'failed');
      if (allDone && t.some(x => x.status === 'completed') && selected.status === 'generating') {
        updateSessionStatus(selected.id, 'review').catch(() => {});
        setSelected(prev => prev ? { ...prev, status: 'review' } : prev);
        setSessions(prev => prev.map(s => s.id === selected.id ? { ...s, status: 'review' } : s));
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [selected, activeWork, addToast]);

  const handleTargetMinutesChange = (value: number) => {
    const next = clampNumber(value, 1, 240);
    setTargetMinutes(next);
    if (trackCount === '') setTrackCount(calculateTrackCount(next, avgTrackSeconds));
    else setAvgTrackSeconds(calculateAvgSeconds(next, Number(trackCount)));
  };

  const handleTrackCountChange = (value: string) => {
    if (value === '') { setTrackCount(''); return; }
    const next = clampNumber(Number(value), 1, 24);
    setTrackCount(next);
    setAvgTrackSeconds(calculateAvgSeconds(targetMinutes, next));
  };

  const handleAvgTrackSecondsChange = (value: number) => {
    const next = clampNumber(value, 15, 900);
    setAvgTrackSeconds(next);
    setTrackCount(calculateTrackCount(targetMinutes, next));
  };

  const toggleVocalStyle = (style: string) => {
    setVocalStyles(prev => {
      const next = prev.includes(style) ? prev.filter(v => v !== style) : [...prev, style];
      return next.length ? next : ['Instrumental only'];
    });
  };

  const applyPreset = (p: typeof SESSION_PRESETS[number]) => {
    setTitle(p.name); setGenre(p.genre); setMood(p.mood); setVocalStyles([p.vocal_style]);
    const minutes = Math.round(p.target_duration_seconds / 60);
    const count = Math.max(1, Math.round(p.target_duration_seconds / p.avg_track_length_seconds));
    setTargetMinutes(minutes);
    setAvgTrackSeconds(calculateAvgSeconds(minutes, count));
    setTrackCount(count);
  };

  const handleCreate = async () => {
    if (!branch || !title.trim()) { addToast('Branch and title are required', 'error'); return; }
    setCreating(true);
    try {
      const config: CreateSessionConfig = {
        branch, title: title.trim(), genre: genre || undefined, mood: mood || undefined,
        vocal_style: vocalStyle, target_duration_seconds: targetMinutes * 60,
        avg_track_length_seconds: avgTrackSeconds,
        track_count: trackCount === '' ? undefined : Number(trackCount),
      };
      const { session, tracks: planned } = await createSessionWithPlan(config, geminiApiKey || '', userId);
      setSessions(prev => [session, ...prev]);
      setSelected(session); setTracks(planned); setRenders([]);
      addToast(`Session "${session.title}" planned — ${planned.length} tracks`, 'success');
      setTitle('');
    } catch (e) { addToast(`Could not create session: ${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setCreating(false); }
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await generateSessionTracks(selected, tracks);
      setTracks(prev => prev.map(t => (t.status === 'planned' || t.status === 'failed') ? { ...t, status: 'queued' } : t));
      setSelected(prev => prev ? { ...prev, status: 'generating' } : prev);
      addToast('Generation queued — tracks render one at a time', 'success');
    } catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setBusy(false); }
  };

  const handleResumeGenerate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await resumeSessionGeneration(selected, tracks);
      setTracks(prev => prev.map(t => {
        const mins = t.status === 'generating' ? minutesSince(t.updated_at) : null;
        return t.status === 'queued' || (t.status === 'generating' && mins !== null && mins >= 20)
          ? { ...t, status: 'queued', error_message: null, updated_at: new Date().toISOString() }
          : t;
      }));
      setSelected(prev => prev ? { ...prev, status: 'generating', error_message: null } : prev);
      addToast('Generation queue resumed', 'success');
    } catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setBusy(false); }
  };

  const toggleApprove = async (t: MusicTrack) => {
    const next = !t.approved;
    setTracks(prev => prev.map(x => x.id === t.id ? { ...x, approved: next } : x));
    try { await setTrackApproved(t.id, next); }
    catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); setTracks(prev => prev.map(x => x.id === t.id ? { ...x, approved: !next } : x)); }
  };

  const handleRegenerate = async (t: MusicTrack) => {
    if (!selected) return;
    setTracks(prev => prev.map(x => x.id === t.id ? {
      ...x,
      status: 'generating',
      approved: false,
      audio_url: null,
      storage_bucket: null,
      storage_path: null,
      audio_mime_type: null,
      file_size_bytes: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    } : x));
    try { await regenerateTrack(selected, t); addToast(`Regenerating "${t.title}"`, 'info'); }
    catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); }
  };

  const approvedCompleted = tracks.filter(t => t.approved && t.status === 'completed');

  const handleStitch = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await stitchSession(selected, approvedCompleted);
      setSelected(prev => prev ? { ...prev, status: 'stitching', error_message: null, final_audio_url: null } : prev);
      setSessions(prev => prev.map(s => s.id === selected.id ? { ...s, status: 'stitching', error_message: null, final_audio_url: null } : s));
      const r = await getRenders(selected.id); setRenders(r);
      addToast(`Stitching ${approvedCompleted.length} tracks into a master`, 'success');
    } catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); }
    finally { setBusy(false); }
  };

  const handleArchive = async (s: MusicSession) => {
    try { await archiveSession(s.id); setSessions(prev => prev.map(x => x.id === s.id ? { ...x, status: 'archived' } : x)); if (selected?.id === s.id) setSelected(prev => prev ? { ...prev, status: 'archived' } : prev); }
    catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); }
  };

  const latestReadyRender = renders.find(r => r.status === 'ready');
  const activeRender = renders.find(r => r.status === 'queued' || r.status === 'processing');
  const activeRenderWorker = getRenderWorkerInfo(activeRender);
  const latestFailedRender = !activeRender && !latestReadyRender ? renders.find(r => r.status === 'failed') : undefined;
  const sessionFailure = !activeRender && !latestReadyRender ? (latestFailedRender?.error_message || selected?.error_message || null) : null;
  const masterReady = !!latestReadyRender?.final_audio_url;
  const queuedTracks = tracks.filter(t => t.status === 'queued');
  const generatingTracks = tracks.filter(t => t.status === 'generating');
  const staleGeneratingTracks = generatingTracks.filter(t => (minutesSince(t.updated_at) ?? 0) >= 20);
  const canResumeQueue = queuedTracks.length > 0 && (generatingTracks.length === 0 || staleGeneratingTracks.length > 0);
  const sessionTabCounts: Record<SessionListTab, number> = {
    ready: sessions.filter(s => sessionInTab(s, 'ready')).length,
    review: sessions.filter(s => sessionInTab(s, 'review')).length,
    archived: sessions.filter(s => sessionInTab(s, 'archived')).length,
  };
  const filteredSessions = sessions.filter(s => sessionInTab(s, sessionTab));
  const sessionPageCount = Math.max(1, Math.ceil(filteredSessions.length / SESSION_PAGE_SIZE));
  const visibleSessions = filteredSessions.slice((sessionPage - 1) * SESSION_PAGE_SIZE, sessionPage * SESSION_PAGE_SIZE);

  useEffect(() => {
    setSessionPage(1);
  }, [sessionTab]);

  useEffect(() => {
    setSessionPage(page => Math.min(page, sessionPageCount));
  }, [sessionPageCount]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
      {/* ── Left: create + session list ── */}
      <div className="lg:col-span-1 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center"><Music className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Trellis Sessions</h2>
            <p className="text-[11px] text-slate-400 font-medium">AI music sessions → stitched master</p>
          </div>
        </div>

        {/* Create form */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> New Session</h3>
          <div className="flex flex-wrap gap-2">
            {SESSION_PRESETS.map(p => (
              <button key={p.id} type="button" onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100 text-[10px] font-black text-violet-600 uppercase tracking-tight hover:border-violet-400 transition">
                {p.name}
              </button>
            ))}
          </div>
          <div><label className={labelCls}>Branch</label>
            <select className={inputCls} value={branch} onChange={e => setBranch(e.target.value)}>
              {branches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Session Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Rekkrd After Dark — Midnight Jazz Vol. 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Genre</label>
              <select className={inputCls} value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">Any</option>{MUSIC_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Mood</label>
              <select className={inputCls} value={mood} onChange={e => setMood(e.target.value)}>
                <option value="">Any</option>{MUSIC_MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="md:col-span-2"><label className={labelCls}>Vocals</label>
              <div className="grid grid-cols-2 gap-2">
                {VOCAL_MIX_OPTIONS.map(v => {
                  const active = vocalStyles.includes(v);
                  return (
                    <button key={v} type="button" onClick={() => toggleVocalStyle(v)}
                      className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-tight transition ${
                        active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                      }`}>
                      {v}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{vocalStyle}</p>
            </div>
            <div><label className={labelCls}>Target (min)</label>
              <input type="number" min={1} className={inputCls} value={targetMinutes} onChange={e => handleTargetMinutesChange(Number(e.target.value))} />
            </div>
            <div><label className={labelCls}>Track Count</label>
              <input type="number" min={1} max={24} className={inputCls} value={trackCount} onChange={e => handleTrackCountChange(e.target.value)} placeholder="auto" />
            </div>
            <div><label className={labelCls}>Avg Track (sec)</label>
              <input type="number" min={15} className={inputCls} value={avgTrackSeconds} onChange={e => handleAvgTrackSecondsChange(Number(e.target.value))} />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estimate</p>
              <p className="mt-1 text-sm font-black text-slate-800">{plannedTrackCount} tracks · {formatDurationMinutes(plannedDurationSeconds)}</p>
              <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-widest ${Math.abs(plannedDurationDeltaSeconds) <= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {plannedDurationDeltaSeconds === 0 ? 'On target' : `${plannedDurationDeltaSeconds > 0 ? '+' : ''}${Math.round(plannedDurationDeltaSeconds / 60)} min vs target`}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleCreate} disabled={creating || !branch || !title.trim()}
            className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-50">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {creating ? 'Planning...' : 'Create + Plan Tracks'}
          </button>
        </div>

        {/* Session list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessions</h3>
            <button onClick={loadSessions} className="text-slate-400 hover:text-emerald-600 transition"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-xl p-1">
            {(['ready', 'review', 'archived'] as SessionListTab[]).map(tab => (
              <button key={tab} type="button" onClick={() => setSessionTab(tab)}
                className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${sessionTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {tab} ({sessionTabCounts[tab]})
              </button>
            ))}
          </div>
          {filteredSessions.length === 0 && !loading ? (
            <p className="text-xs text-slate-400 px-1 py-4">No {sessionTab} sessions.</p>
          ) : visibleSessions.map(s => {
            const meta = SESSION_STATUS_META[s.status] || SESSION_STATUS_META.draft;
            return (
              <button key={s.id} type="button" onClick={() => selectSession(s)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition ${selected?.id === s.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-800 text-xs truncate">{s.title}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-1">{[s.genre, s.mood, `${s.track_count || '?'} tracks`].filter(Boolean).join(' · ')}</p>
                <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest mt-1">Updated {formatSessionDate(s.updated_at)}</p>
                {s.created_at !== s.updated_at && (
                  <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">Created {formatSessionDate(s.created_at)}</p>
                )}
              </button>
            );
          })}
          {filteredSessions.length > SESSION_PAGE_SIZE && (
            <div className="flex items-center justify-between px-1 pt-1">
              <button type="button" disabled={sessionPage <= 1} onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:text-emerald-600">Prev</button>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Page {sessionPage} / {sessionPageCount}</span>
              <button type="button" disabled={sessionPage >= sessionPageCount} onClick={() => setSessionPage(p => Math.min(sessionPageCount, p + 1))}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:text-emerald-600">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: session detail ── */}
      <div className="lg:col-span-2">
        {!selected ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-[2rem] border border-slate-100">
            <ListMusic size={44} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">Select or create a session</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">Plan a set of tracks, generate them, approve the keepers, and stitch them into one master.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Session header */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selected.title}</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">
                    {[selected.genre, selected.mood, selectedVocalSummary, `${selected.track_count || tracks.length} tracks`,
                      selected.target_duration_seconds ? `~${Math.round(selected.target_duration_seconds / 60)} min target` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${(SESSION_STATUS_META[selected.status] || SESSION_STATUS_META.draft).cls}`}>
                  {(SESSION_STATUS_META[selected.status] || SESSION_STATUS_META.draft).label}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                {tracks.some(t => t.status === 'planned' || t.status === 'failed') && (
                  <button type="button" onClick={handleGenerate} disabled={busy}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition disabled:opacity-50">
                    <Wand2 size={15} /> Generate Tracks
                  </button>
                )}
                {canResumeQueue && (
                  <button type="button" onClick={handleResumeGenerate} disabled={busy}
                    className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-amber-600 transition disabled:opacity-50">
                    <RefreshCw size={15} /> Resume Queue ({queuedTracks.length + staleGeneratingTracks.length})
                  </button>
                )}
                {masterReady ? (
                  <>
                    <button type="button" disabled
                      className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 opacity-90">
                      <CheckCircle2 size={15} /> Master Ready
                    </button>
                    <button type="button" onClick={() => onNavigate?.('trellis-episodes')}
                      className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition">
                      <ArrowRight size={15} /> Open Episodes
                    </button>
                    <button type="button" onClick={handleStitch} disabled={busy || approvedCompleted.length === 0}
                      className="px-4 py-2.5 text-violet-600 bg-violet-50 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-violet-100 transition disabled:opacity-40">
                      <Layers size={15} /> Rebuild Master
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleStitch} disabled={busy || approvedCompleted.length === 0}
                    className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-violet-700 transition disabled:opacity-40">
                    <Layers size={15} /> Stitch Approved ({approvedCompleted.length})
                  </button>
                )}
                <button type="button" onClick={() => handleArchive(selected)} className="px-4 py-2.5 text-slate-400 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition flex items-center gap-1">
                  <Archive size={14} /> Archive
                </button>
              </div>
            </div>

            {/* Final master */}
            {(latestReadyRender || activeRender || latestFailedRender || selected.status === 'failed') && (
              <div className={`bg-white p-6 rounded-[2rem] border-2 shadow-sm ${sessionFailure ? 'border-rose-200' : 'border-emerald-200'}`}>
                <h4 className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3 ${sessionFailure ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {sessionFailure ? <AlertCircle size={15} /> : <Layers size={15} />}
                  Final Master
                </h4>
                {latestReadyRender?.final_audio_url ? (
                  <div className="space-y-3">
                    <audio controls src={latestReadyRender.final_audio_url} className="w-full" />
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={latestReadyRender.final_audio_url} download className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700">
                        <Download size={14} /> Download master
                      </a>
                      <button type="button" onClick={() => onNavigate?.('trellis-episodes')}
                        className="inline-flex items-center gap-1 text-[11px] font-black text-slate-700 uppercase tracking-widest hover:text-emerald-700">
                        <ArrowRight size={14} /> Use in episode
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">
                      No extra approval is needed here. The approved tracks have been stitched into the final master; attach this session to an episode next.
                    </p>
                  </div>
                ) : sessionFailure ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-3">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span className="font-medium">{sessionFailure}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">
                      You can adjust the worker upload settings, then run Stitch Approved again.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const progress = typeof activeRenderWorker?.progress === 'number' ? activeRenderWorker.progress : null;
                    const lastUpdate = activeRenderWorker?.heartbeat_at || activeRender?.updated_at;
                    const stale = (minutesSince(lastUpdate) ?? 0) >= 15;
                    return (
                      <div className={`rounded-xl p-3 border ${stale ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                        <div className="flex items-start gap-2">
                          {stale ? <Activity size={14} className="mt-0.5 shrink-0" /> : <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-widest">
                                {activeRenderWorker?.message || 'Rebuilding master audio'}
                              </p>
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{activeRender?.status || selected.status}</span>
                            </div>
                            {progress !== null && (
                              <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-bold opacity-80">
                              <span>Elapsed: {formatElapsed(activeRender?.created_at)}</span>
                              <span>Last update: {formatAge(lastUpdate)}</span>
                              <span>{progress !== null ? `Progress: ${Math.round(progress)}%` : `Stage: ${activeRenderWorker?.stage || activeRender?.status || 'stitching'}`}</span>
                            </div>
                            {activeRenderWorker?.total_tracks != null && (
                              <p className="mt-1 text-[10px] font-medium opacity-70">
                                Tracks: {activeRenderWorker.stitched_tracks ?? activeRenderWorker.downloaded_tracks ?? 0} / {activeRenderWorker.total_tracks}
                              </p>
                            )}
                            {stale && (
                              <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                                No heartbeat for 15+ minutes. Check the stitch worker before starting another rebuild.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* Tracks */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tracks</h4>
              {tracks.length === 0 ? (
                <div className="py-10 text-center bg-white rounded-2xl border border-slate-100"><Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto" /></div>
              ) : tracks.map(t => {
                const b = TRACK_BADGE[t.status];
                const activeTrack = t.status === 'queued' || t.status === 'generating';
                const trackProgress = activeTrack ? estimateTrackProgress(t) : null;
                const trackUpdatedMins = minutesSince(t.updated_at);
                const trackStale = activeTrack && trackUpdatedMins !== null && trackUpdatedMins >= 20;
                return (
                  <div key={t.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-300">#{t.track_number}</span>
                          <h5 className="font-black text-slate-800 text-sm truncate">{t.title}</h5>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${b.cls}`}>
                            {b.spin && <Loader2 size={9} className="animate-spin" />}{b.label}
                          </span>
                          {t.vocal_style && (
                            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-[9px] font-black uppercase tracking-widest">
                              {t.vocal_style}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mt-1 line-clamp-2">{t.prompt}</p>
                      </div>
                      {t.status === 'completed' && (
                        <button type="button" onClick={() => toggleApprove(t)}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition ${t.approved ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {t.approved ? <><Check size={12} /> Approved</> : 'Approve'}
                        </button>
                      )}
                    </div>
                    {t.status === 'completed' && t.audio_url && (
                      <div className="mt-3 flex items-center gap-3">
                        <audio controls src={t.audio_url} className="w-full h-9" />
                        <button type="button" onClick={() => handleRegenerate(t)} title="Regenerate" className="text-slate-300 hover:text-emerald-600 transition shrink-0"><RefreshCw size={15} /></button>
                      </div>
                    )}
                    {activeTrack && (
                      <div className={`mt-3 rounded-xl border p-3 ${trackStale ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                        <div className="flex items-start gap-2">
                          {trackStale ? <Activity size={14} className="mt-0.5 shrink-0" /> : <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[11px] font-black uppercase tracking-widest">
                                {t.status === 'queued' ? 'Waiting for generator' : 'Generating replacement'}
                              </p>
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Track #{t.track_number}</span>
                            </div>
                            {trackProgress !== null && (
                              <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(3, Math.min(100, trackProgress))}%` }} />
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-bold opacity-80">
                              <span>Elapsed: {formatElapsed(t.updated_at)}</span>
                              <span>Last update: {formatAge(t.updated_at)}</span>
                              <span>{trackProgress !== null ? `Estimate: ${Math.round(trackProgress)}%` : `Status: ${t.status}`}</span>
                            </div>
                            <p className="mt-1 text-[10px] font-medium opacity-70">
                              This is an estimate from the last status update. Exact progress needs heartbeat updates from the n8n/Lyria workflow.
                            </p>
                            {trackStale && (
                              <p className="mt-2 text-[10px] font-black uppercase tracking-widest">
                                No update for 20+ minutes. Retry this track if it does not complete soon.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {t.status === 'failed' && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-[11px] text-rose-600"><AlertCircle size={12} />{t.error_message || 'Generation failed'}</span>
                        <button type="button" onClick={() => handleRegenerate(t)} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Retry</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrellisStudio;

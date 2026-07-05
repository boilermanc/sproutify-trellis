import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Music, Loader2, RefreshCw, Archive, AlertCircle, CheckCircle2, XCircle, Wand2,
  Sparkles, ListMusic, Layers, Download, Plus, Check,
} from 'lucide-react';
import { MusicSession, MusicTrack, MusicRender, CreateSessionConfig } from '../types';
import {
  MUSIC_GENRES, MUSIC_MOODS, MUSIC_VOCALS, SESSION_PRESETS, SESSION_STATUS_META,
} from '../constants';
import {
  createSessionWithPlan, getSessions, getTracks, getRenders,
  generateSessionTracks, setTrackApproved, regenerateTrack, stitchSession, archiveSession, updateSessionStatus,
} from '../services/sessionService';

interface TrellisStudioProps {
  branches: Array<{ slug: string; name: string }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
  geminiApiKey?: string;
}

const TRACK_BADGE: Record<MusicTrack['status'], { label: string; cls: string; spin?: boolean }> = {
  planned: { label: 'Planned', cls: 'bg-slate-100 text-slate-500' },
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-600' },
  generating: { label: 'Generating', cls: 'bg-amber-100 text-amber-700', spin: true },
  completed: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
};

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

const TrellisStudio: React.FC<TrellisStudioProps> = ({ branches, addToast, userId, geminiApiKey }) => {
  const [sessions, setSessions] = useState<MusicSession[]>([]);
  const [selected, setSelected] = useState<MusicSession | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [renders, setRenders] = useState<MusicRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form
  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [vocalStyle, setVocalStyle] = useState<string>(MUSIC_VOCALS[0]);
  const [targetMinutes, setTargetMinutes] = useState(15);
  const [trackCount, setTrackCount] = useState<number | ''>(5);
  const [avgTrackSeconds, setAvgTrackSeconds] = useState(180);

  useEffect(() => { if (!branch && branches[0]) setBranch(branches[0].slug); }, [branches, branch]);

  const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';

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

  const applyPreset = (p: typeof SESSION_PRESETS[number]) => {
    setTitle(p.name); setGenre(p.genre); setMood(p.mood); setVocalStyle(p.vocal_style);
    setTargetMinutes(Math.round(p.target_duration_seconds / 60)); setAvgTrackSeconds(p.avg_track_length_seconds);
    setTrackCount(Math.max(1, Math.round(p.target_duration_seconds / p.avg_track_length_seconds)));
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

  const toggleApprove = async (t: MusicTrack) => {
    const next = !t.approved;
    setTracks(prev => prev.map(x => x.id === t.id ? { ...x, approved: next } : x));
    try { await setTrackApproved(t.id, next); }
    catch (e) { addToast(`${e instanceof Error ? e.message : 'error'}`, 'error'); setTracks(prev => prev.map(x => x.id === t.id ? { ...x, approved: !next } : x)); }
  };

  const handleRegenerate = async (t: MusicTrack) => {
    if (!selected) return;
    setTracks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'generating', approved: false } : x));
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
  const latestFailedRender = !activeRender && !latestReadyRender ? renders.find(r => r.status === 'failed') : undefined;
  const sessionFailure = !activeRender && !latestReadyRender ? (latestFailedRender?.error_message || selected?.error_message || null) : null;

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
            <div><label className={labelCls}>Vocals</label>
              <select className={inputCls} value={vocalStyle} onChange={e => setVocalStyle(e.target.value)}>
                {MUSIC_VOCALS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Target (min)</label>
              <input type="number" min={1} className={inputCls} value={targetMinutes} onChange={e => setTargetMinutes(Number(e.target.value))} />
            </div>
            <div><label className={labelCls}>Track Count</label>
              <input type="number" min={1} className={inputCls} value={trackCount} onChange={e => setTrackCount(e.target.value === '' ? '' : Number(e.target.value))} placeholder="auto" />
            </div>
            <div><label className={labelCls}>Avg Track (sec)</label>
              <input type="number" min={15} className={inputCls} value={avgTrackSeconds} onChange={e => setAvgTrackSeconds(Number(e.target.value))} />
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
          {sessions.length === 0 && !loading ? (
            <p className="text-xs text-slate-400 px-1 py-4">No sessions yet.</p>
          ) : sessions.map(s => {
            const meta = SESSION_STATUS_META[s.status] || SESSION_STATUS_META.draft;
            return (
              <button key={s.id} type="button" onClick={() => selectSession(s)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition ${selected?.id === s.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-800 text-xs truncate">{s.title}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-1">{[s.genre, s.mood, `${s.track_count || '?'} tracks`].filter(Boolean).join(' · ')}</p>
                <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest mt-1">{formatSessionDate(s.created_at)}</p>
              </button>
            );
          })}
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
                    {[selected.genre, selected.mood, selected.vocal_style, `${selected.track_count || tracks.length} tracks`,
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
                <button type="button" onClick={handleStitch} disabled={busy || approvedCompleted.length === 0}
                  className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-violet-700 transition disabled:opacity-40">
                  <Layers size={15} /> Stitch Approved ({approvedCompleted.length})
                </button>
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
                    <a href={latestReadyRender.final_audio_url} download className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700">
                      <Download size={14} /> Download master
                    </a>
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
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3">
                    <Loader2 size={14} className="animate-spin" /> Stitching in progress — this updates automatically when the master is ready.
                  </div>
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

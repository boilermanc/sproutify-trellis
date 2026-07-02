import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Music, Sparkles, Loader2, RefreshCw, Archive, AlertCircle, Clock, CheckCircle2, XCircle, Wand2,
} from 'lucide-react';
import { MusicGeneration, MusicGenConfig } from '../types';
import {
  MUSIC_GENRES, MUSIC_MOODS, MUSIC_VOCALS, MUSIC_DURATIONS, MUSIC_PRESETS,
} from '../constants';
import { submitMusicJob, getMusicJobs, archiveMusicJob } from '../services/musicService';
import { useMusicPoller } from '../hooks/useMusicPoller';

interface TrellisStudioProps {
  branches: Array<{ slug: string; name: string }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
}

const STATUS_META: Record<MusicGeneration['status'], { label: string; cls: string; icon: React.ElementType }> = {
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-600', icon: Clock },
  generating: { label: 'Composing', cls: 'bg-amber-100 text-amber-700', icon: Loader2 },
  completed: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700', icon: XCircle },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-400', icon: Archive },
};

const TrellisStudio: React.FC<TrellisStudioProps> = ({ branches, addToast, userId }) => {
  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<string>('');
  const [mood, setMood] = useState<string>('');
  const [vocalStyle, setVocalStyle] = useState<string>(MUSIC_VOCALS[0]);
  const [durationSeconds, setDurationSeconds] = useState<number>(30);

  const [generations, setGenerations] = useState<MusicGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<MusicGeneration | null>(null);

  useEffect(() => {
    if (!branch && branches[0]) setBranch(branches[0].slug);
  }, [branches, branch]);

  const loadGenerations = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getMusicJobs(branch || undefined, 50);
      setGenerations(rows);
    } catch (err) {
      addToast(`Failed to load songs: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [branch, addToast]);

  useEffect(() => { loadGenerations(); }, [loadGenerations]);

  // Poll non-terminal jobs
  const activeJobIds = useMemo(
    () => generations.filter(g => g.status === 'queued' || g.status === 'generating').map(g => g.id),
    [generations],
  );

  const handleJobUpdate = useCallback((job: MusicGeneration) => {
    setGenerations(prev => prev.map(g => (g.id === job.id ? { ...g, ...job } : g)));
    if (job.status === 'completed') addToast(`"${job.title}" is ready to review`, 'success');
    if (job.status === 'failed') addToast(`"${job.title}" failed: ${job.error_message || 'unknown error'}`, 'error');
  }, [addToast]);

  useMusicPoller(activeJobIds, handleJobUpdate, activeJobIds.length > 0);

  const applyPreset = (p: typeof MUSIC_PRESETS[number]) => {
    setTitle(p.title);
    setPrompt(p.prompt);
    setGenre(p.genre);
    setMood(p.mood);
    setVocalStyle(p.vocal_style);
    setDurationSeconds(p.duration_seconds);
  };

  const canGenerate = branch && title.trim() && prompt.trim() && !submitting;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setSubmitting(true);
    try {
      const config: MusicGenConfig = {
        branch,
        title: title.trim(),
        prompt: prompt.trim(),
        genre: genre || undefined,
        mood: mood || undefined,
        vocal_style: vocalStyle || undefined,
        duration_seconds: durationSeconds,
      };
      const { job_id } = await submitMusicJob(config, userId);

      // Optimistic row so the poller starts tracking immediately
      const optimistic: MusicGeneration = {
        id: job_id, campaign_id: null, branch, created_by: userId ?? null,
        title: config.title, prompt: config.prompt, final_prompt: null,
        genre: genre || null, mood: mood || null, vocal_style: vocalStyle || null,
        duration_seconds: durationSeconds, provider: 'google', model: null,
        status: 'queued', progress: 0, error_message: null, retry_count: 0,
        storage_bucket: null, storage_path: null, audio_url: null, audio_mime_type: null,
        file_size_bytes: null, cost_estimate: 0, generation_started_at: null, completed_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      setGenerations(prev => [optimistic, ...prev]);
      addToast('Song queued — generating now', 'success');
      setTitle(''); setPrompt('');
    } catch (err) {
      addToast(`Could not start generation: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (g: MusicGeneration) => {
    try {
      await archiveMusicJob(g.id);
      setGenerations(prev => prev.map(x => (x.id === g.id ? { ...x, status: 'archived' } : x)));
      if (reviewing?.id === g.id) setReviewing(null);
    } catch (err) {
      addToast(`Archive failed: ${err instanceof Error ? err.message : 'error'}`, 'error');
    }
  };

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';
  const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-20">
      {/* Create form */}
      <div className="xl:col-span-1 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <Music className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Trellis Studio</h2>
            <p className="text-[11px] text-slate-400 font-medium">AI music &amp; theme songs (Lyria)</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
          {/* Presets */}
          <div>
            <label className={labelCls}>Quick Start</label>
            <div className="flex flex-wrap gap-2">
              {MUSIC_PRESETS.map(p => (
                <button key={p.id} type="button" onClick={() => applyPreset(p)}
                  className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100 text-[10px] font-black text-violet-600 uppercase tracking-tight hover:border-violet-400 transition">
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Branch</label>
            <select className={inputCls} value={branch} onChange={e => setBranch(e.target.value)}>
              {branches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Song Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Rekkrd After Dark Intro" />
          </div>

          <div>
            <label className={labelCls}>Prompt / Song Idea</label>
            <textarea className={`${inputCls} resize-none`} rows={4} value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the song — vibe, instruments, brand phrase to include..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Genre</label>
              <select className={inputCls} value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">Any</option>
                {MUSIC_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Mood</label>
              <select className={inputCls} value={mood} onChange={e => setMood(e.target.value)}>
                <option value="">Any</option>
                {MUSIC_MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vocals</label>
              <select className={inputCls} value={vocalStyle} onChange={e => setVocalStyle(e.target.value)}>
                {MUSIC_VOCALS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Duration</label>
              <select className={inputCls} value={durationSeconds} onChange={e => setDurationSeconds(Number(e.target.value))}>
                {MUSIC_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <button type="button" onClick={handleGenerate} disabled={!canGenerate}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-50">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
            {submitting ? 'Starting...' : 'Generate Song'}
          </button>
          <p className="text-[10px] text-slate-400 text-center font-medium">Generation runs in the background — the list updates when it's ready.</p>
        </div>
      </div>

      {/* Generations list */}
      <div className="xl:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Generations</h3>
          <button type="button" onClick={loadGenerations} className="text-slate-400 hover:text-emerald-600 transition" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && generations.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
        ) : generations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-[2rem] border border-slate-100">
            <Music size={40} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">No songs yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">Fill out the form and hit Generate — your first track will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {generations.map(g => {
              const meta = STATUS_META[g.status];
              const StatusIcon = meta.icon;
              return (
                <div key={g.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-black text-slate-800 text-sm truncate">{g.title}</h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${meta.cls}`}>
                          <StatusIcon size={10} className={g.status === 'generating' ? 'animate-spin' : ''} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium truncate">
                        {[g.genre, g.mood, g.vocal_style].filter(Boolean).join(' · ') || g.prompt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {g.status === 'completed' && (
                        <button type="button" onClick={() => setReviewing(g)}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition">
                          Review
                        </button>
                      )}
                      {g.status !== 'archived' && (
                        <button type="button" onClick={() => handleArchive(g)} className="text-slate-300 hover:text-slate-500 transition" title="Archive">
                          <Archive size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  {g.status === 'failed' && g.error_message && (
                    <div className="mt-3 flex items-start gap-2 text-[11px] text-rose-600 bg-rose-50 rounded-xl p-3">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>{g.error_message}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setReviewing(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Music size={18} className="text-emerald-600" />
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Review</h4>
              </div>
              <button type="button" onClick={() => setReviewing(null)} className="text-slate-400 hover:text-slate-700 transition"><XCircle size={22} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">{reviewing.title}</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  {[reviewing.genre, reviewing.mood, reviewing.vocal_style, reviewing.duration_seconds ? `${reviewing.duration_seconds}s` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              {reviewing.audio_url ? (
                <audio controls src={reviewing.audio_url} className="w-full">
                  Your browser doesn't support audio playback.
                </audio>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl p-4">
                  <AlertCircle size={14} /> Audio URL not available on this record.
                </div>
              )}
              <div>
                <p className={labelCls}>Prompt used</p>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3">{reviewing.final_prompt || reviewing.prompt}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => handleArchive(reviewing)}
                  className="px-4 py-2 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition flex items-center gap-1">
                  <Archive size={14} /> Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrellisStudio;

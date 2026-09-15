import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileAudio, Loader2, Mic2, Save, Trash2, Upload } from 'lucide-react';
import type { TranscriptionJob } from '../types';
import { createTranscription, deleteTranscription, exportTranscript, listTranscriptions, updateTranscript } from '../services/transcriptionService';

interface Props { addToast?: (message: string, type?: 'success' | 'error' | 'info') => void; }

const Transcriptions: React.FC<Props> = ({ addToast }) => {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'standard' | 'diarized'>('standard');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const selected = useMemo(() => jobs.find(job => job.id === selectedId) || null, [jobs, selectedId]);

  const load = async () => {
    try {
      const next = await listTranscriptions();
      setJobs(next);
      setSelectedId(current => current && next.some(job => job.id === current) ? current : next[0]?.id || null);
    } catch (error) { addToast?.(error instanceof Error ? error.message : 'Could not load transcripts.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected) { setEditTitle(selected.title); setEditText(selected.transcript_text || ''); } }, [selected?.id, selected?.updated_at]);

  const submit = async () => {
    if (!file) return addToast?.('Choose an audio or video file first.', 'error');
    setBusy(true);
    try {
      const created = await createTranscription(file, title.trim() || file.name.replace(/\.[^.]+$/, ''), mode);
      setJobs(current => [created, ...current.filter(job => job.id !== created.id)]);
      setSelectedId(created.id); setFile(null); setTitle('');
      addToast?.('Transcript is ready for review.', 'success');
    } catch (error) { addToast?.(error instanceof Error ? error.message : 'Transcription failed.', 'error'); await load(); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await updateTranscript(selected.id, editTitle, editText);
      setJobs(current => current.map(job => job.id === updated.id ? updated : job));
      addToast?.('Transcript saved.', 'success');
    } catch (error) { addToast?.(error instanceof Error ? error.message : 'Could not save transcript.', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async (job: TranscriptionJob) => {
    if (!window.confirm(`Delete “${job.title}” and its source recording?`)) return;
    setBusy(true);
    try { await deleteTranscription(job.id); setJobs(current => current.filter(item => item.id !== job.id)); setSelectedId(null); addToast?.('Recording and transcript deleted.', 'success'); }
    catch (error) { addToast?.(error instanceof Error ? error.message : 'Could not delete transcript.', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-8">
      <div className="flex items-start gap-4"><div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300"><Mic2 size={26} /></div><div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Content Studio</p><h1 className="mt-1 text-3xl font-black tracking-tight">Transcription Studio</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Turn recordings into editable transcripts, timed captions, and HyperFrames-ready word timing. Files stay in private Trellis storage.</p></div></div>
      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
        <label className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold"><span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Recording</span><input type="file" accept="audio/*,video/*" onChange={event => { const next = event.target.files?.[0] || null; setFile(next); if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, '')); }} className="block w-full text-xs text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:font-bold file:text-white" /></label>
        <label className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Title</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Interview or voice note" className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500" /></label>
        <label className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Mode</span><select value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="bg-slate-900 text-sm font-bold text-white outline-none"><option value="standard">Standard</option><option value="diarized">Identify speakers</option></select></label>
        <button onClick={submit} disabled={busy || !file} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-sm font-black uppercase tracking-wider text-white disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />} Transcribe</button>
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm"><h2 className="px-2 pb-3 text-xs font-black uppercase tracking-widest text-slate-400">Recent transcripts</h2>{loading ? <Loader2 className="mx-auto my-10 animate-spin text-emerald-600" /> : jobs.length === 0 ? <div className="p-8 text-center text-sm text-slate-400"><FileAudio className="mx-auto mb-3" />No recordings yet.</div> : <div className="space-y-2">{jobs.map(job => <button key={job.id} onClick={() => setSelectedId(job.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === job.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}><div className="truncate text-sm font-black text-slate-800">{job.title}</div><div className="mt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>{job.mode === 'diarized' ? 'Speakers' : 'Standard'}</span><span className={job.status === 'completed' ? 'text-emerald-600' : job.status === 'failed' ? 'text-rose-600' : 'text-amber-600'}>{job.status}</span></div></button>)}</div>}</aside>
      <main className="min-h-[480px] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">{!selected ? <div className="flex h-full min-h-[420px] items-center justify-center text-center text-slate-400"><div><FileAudio className="mx-auto mb-3" size={36} /><p className="font-bold">Upload a recording or select a transcript.</p></div></div> : <div className="space-y-5"><div className="flex flex-wrap items-center gap-3"><input value={editTitle} onChange={event => setEditTitle(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-lg font-black text-slate-900 outline-none focus:border-emerald-400" /><button onClick={save} disabled={busy || selected.status !== 'completed'} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"><Save size={16} /> Save</button><button onClick={() => remove(selected)} disabled={busy} className="rounded-xl bg-rose-50 p-3 text-rose-600"><Trash2 size={17} /></button></div>
        {selected.error_message && <div className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{selected.error_message}</div>}
        <textarea value={editText} onChange={event => setEditText(event.target.value)} disabled={selected.status !== 'completed'} className="min-h-[360px] w-full resize-y rounded-2xl border border-slate-200 p-5 text-sm leading-7 text-slate-700 outline-none focus:border-emerald-400 disabled:bg-slate-50" placeholder={selected.status === 'processing' ? 'Transcribing…' : 'Transcript text'} />
        {selected.status === 'completed' && <div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Download</span>{(['txt','srt','vtt','json'] as const).map(format => <button key={format} onClick={() => exportTranscript({ ...selected, title: editTitle, transcript_text: editText }, format)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase text-slate-600 hover:border-emerald-300 hover:text-emerald-700"><Download size={14} /> {format}</button>)}</div>}
      </div>}</main>
    </div>
  </div>;
};

export default Transcriptions;

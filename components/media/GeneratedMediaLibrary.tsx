import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, DollarSign, Download, Film, Instagram, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import type { Branch, MediaGenerationLibraryItem } from '../../types';
import { approveMediaGenerationOutput, getMediaGenerationLibrary, scheduleMediaGenerationOutput } from '../../services/mediaGenerationService';

interface Props {
  branches: Branch[];
  publishingEnabled: boolean;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type LibraryFilter = 'all' | 'needs_approval' | 'approved' | 'publishing';

const localDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const defaultSchedule = () => localDateTime(new Date(Date.now() + 60 * 60_000));

const GeneratedMediaLibrary: React.FC<Props> = ({ branches, publishingEnabled, addToast }) => {
  const [items, setItems] = useState<MediaGenerationLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [publishItem, setPublishItem] = useState<MediaGenerationLibraryItem | null>(null);
  const [branchId, setBranchId] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [caption, setCaption] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule);
  const [publishKey, setPublishKey] = useState('');

  const activeBranches = useMemo(() => branches.filter(branch => branch.is_active), [branches]);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await getMediaGenerationLibrary());
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not load generated media.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => items.filter(item => {
    if (filter === 'needs_approval') return !item.approved;
    if (filter === 'approved') return item.approved;
    if (filter === 'publishing') return item.publishing.length > 0;
    return true;
  }), [filter, items]);

  const approve = async (item: MediaGenerationLibraryItem) => {
    try {
      setWorkingId(item.output_id);
      await approveMediaGenerationOutput(item.output_id);
      setItems(current => current.map(row => row.output_id === item.output_id ? { ...row, approved: true, approved_at: new Date().toISOString() } : row));
      addToast('Video approved for publishing.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not approve this video.', 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const openPublishing = (item: MediaGenerationLibraryItem) => {
    setPublishItem(item);
    setBranchId(item.project?.branch_id || activeBranches[0]?.id || '');
    setCaption(item.job.prompt.slice(0, 2200));
    setScheduledFor(defaultSchedule());
    setPublishKey(crypto.randomUUID());
  };

  const schedule = async () => {
    if (!publishItem || !branchId || !caption.trim() || !scheduledFor) return;
    try {
      setWorkingId(publishItem.output_id);
      await scheduleMediaGenerationOutput({
        output_id: publishItem.output_id,
        branch_id: branchId,
        platform,
        caption: caption.trim(),
        scheduled_for: new Date(scheduledFor).toISOString(),
        idempotency_key: publishKey,
      });
      setPublishItem(null);
      addToast('Video added to the Trellis publishing queue.', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not schedule this video.', 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-black text-slate-900">Created media</h2><p className="mt-1 text-xs text-slate-500">Every completed generation, its source prompt, measured cost, approval, and publishing history.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{(['all', 'needs_approval', 'approved', 'publishing'] as LibraryFilter[]).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${filter === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{value.replace('_', ' ')}</button>)}</div>
      </section>

      {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div> : visibleItems.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Film className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">No generated videos match this view yet.</p></div> : <div className="grid gap-5 lg:grid-cols-2">
        {visibleItems.map(item => {
          const latestPublication = item.publishing[0];
          return <article key={item.output_id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="aspect-video bg-black">{item.signed_url ? <video controls preload="metadata" src={item.signed_url} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">Preview unavailable</div>}</div>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">{item.project?.name || 'Media project'}</p><p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-800">{item.job.prompt}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${item.approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.approved ? 'Approved' : 'Needs approval'}</span></div>
              <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500"><span>{item.job.task_type.replaceAll('_', ' ')}</span><span>{item.asset.duration_seconds ? `${Number(item.asset.duration_seconds).toFixed(1)} sec` : 'Duration pending'}</span><span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{item.attempt?.actual_cost_usd == null ? 'Cost pending' : `$${Number(item.attempt.actual_cost_usd).toFixed(2)}`}</span></div>
              {latestPublication && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">Publishing: {latestPublication.platform} · {latestPublication.status} · {new Date(latestPublication.scheduled_for).toLocaleString()}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {!item.approved && <button type="button" disabled={workingId === item.output_id} onClick={() => void approve(item)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Approve</button>}
                {item.approved && <button type="button" disabled={!publishingEnabled || workingId === item.output_id} onClick={() => openPublishing(item)} title={publishingEnabled ? 'Send to Post Scheduler' : 'Publishing handoff is paused until the private-media resolver is deployed'} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /> Send to publishing</button>}
                {item.signed_url && <a href={item.signed_url} download className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"><Download className="h-4 w-4" /> Download</a>}
              </div>
              {item.approved && !publishingEnabled && <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-amber-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Publishing remains paused until the worker can resolve private generated media immediately before posting.</p>}
            </div>
          </article>;
        })}
      </div>}

      {publishItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Schedule generated video">
        <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-indigo-50 p-3"><CalendarClock className="h-5 w-5 text-indigo-600" /></div><div><h3 className="text-lg font-black text-slate-900">Send to Post Scheduler</h3><p className="text-xs text-slate-500">The existing Trellis publishing worker will post this video.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Brand<select value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Destination<select value={platform} onChange={event => setPlatform(event.target.value as 'instagram' | 'tiktok')} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><option value="instagram">Instagram Reel</option><option value="tiktok">TikTok video</option></select></label>
          </div>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">Caption<textarea rows={4} maxLength={2200} value={caption} onChange={event => setCaption(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 text-slate-700" /></label>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">Publish around<input type="datetime-local" value={scheduledFor} min={localDateTime(new Date())} max={localDateTime(new Date(Date.now() + 30 * 24 * 60 * 60_000))} onChange={event => setScheduledFor(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700" /></label>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Instagram and TikTok video are supported first. Facebook video remains disabled until its publisher gains video support.</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPublishItem(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={workingId === publishItem.output_id || !branchId || !caption.trim() || !scheduledFor} onClick={() => void schedule()} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{workingId === publishItem.output_id ? <Loader2 className="h-4 w-4 animate-spin" /> : platform === 'instagram' ? <Instagram className="h-4 w-4" /> : <Send className="h-4 w-4" />} Add to queue</button></div>
        </div>
      </div>}
    </div>
  );
};

export default GeneratedMediaLibrary;

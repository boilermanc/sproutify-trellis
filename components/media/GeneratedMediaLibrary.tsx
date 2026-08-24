import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, CalendarClock, CheckCircle2, DollarSign, Download, Film, Filter, Instagram, Loader2, RefreshCw, Send, ShieldCheck, Trash2, Type } from 'lucide-react';
import type { Branch, MediaGenerationLibraryItem } from '../../types';
import { approveMediaGenerationOutput, createMediaPlatformExport, deleteMediaGenerationOutput, getMediaGenerationLibrary, scheduleMediaGenerationOutput } from '../../services/mediaGenerationService';
import MediaFinishingEditor from './MediaFinishingEditor';

interface Props {
  branches: Branch[];
  finishingEnabled: boolean;
  publishingEnabled: boolean;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type LibraryFilter = 'all' | 'needs_approval' | 'approved' | 'publishing';
type LibrarySort = 'newest' | 'oldest' | 'branch' | 'cost';

const localDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const defaultSchedule = () => localDateTime(new Date(Date.now() + 60 * 60_000));

const GeneratedMediaLibrary: React.FC<Props> = ({ branches, finishingEnabled, publishingEnabled, addToast }) => {
  const [items, setItems] = useState<MediaGenerationLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [publishItem, setPublishItem] = useState<MediaGenerationLibraryItem | null>(null);
  const [branchId, setBranchId] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [caption, setCaption] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule);
  const [publishKey, setPublishKey] = useState('');
  const [editItem, setEditItem] = useState<MediaGenerationLibraryItem | null>(null);
  const [removeItem, setRemoveItem] = useState<MediaGenerationLibraryItem | null>(null);
  const [exportItem, setExportItem] = useState<MediaGenerationLibraryItem | null>(null);
  const [exportFraming, setExportFraming] = useState<'blur_background' | 'center_crop' | 'fit'>('blur_background');

  const activeBranches = useMemo(() => branches.filter(branch => branch.is_active), [branches]);
  const branchNames = useMemo(() => new Map(branches.map(branch => [branch.id, branch.name])), [branches]);
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
  useEffect(() => {
    if (!items.some(item =>
      (item.finishing && ['queued', 'running', 'cancel_requested'].includes(item.finishing.status)) ||
      (item.platform_export && ['queued', 'running', 'cancel_requested'].includes(item.platform_export.status))
    )) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  const branchItems = useMemo(() => items.filter(item => {
    if (branchFilter === 'all') return true;
    if (branchFilter === 'personal') return !item.project?.branch_id;
    return item.project?.branch_id === branchFilter;
  }), [branchFilter, items]);

  const statusCounts = useMemo(() => ({
    all: branchItems.length,
    needs_approval: branchItems.filter(item => !item.approved).length,
    approved: branchItems.filter(item => item.approved).length,
    publishing: branchItems.filter(item => item.publishing.length > 0).length,
  }), [branchItems]);

  const visibleItems = useMemo(() => branchItems.filter(item => {
    if (filter === 'needs_approval') return !item.approved;
    if (filter === 'approved') return item.approved;
    if (filter === 'publishing') return item.publishing.length > 0;
    return true;
  }).sort((left, right) => {
    if (sort === 'oldest') return new Date(left.job.created_at).getTime() - new Date(right.job.created_at).getTime();
    if (sort === 'branch') {
      const leftBranch = left.project?.branch_id ? branchNames.get(left.project.branch_id) || '' : 'Personal';
      const rightBranch = right.project?.branch_id ? branchNames.get(right.project.branch_id) || '' : 'Personal';
      return leftBranch.localeCompare(rightBranch) || new Date(right.job.created_at).getTime() - new Date(left.job.created_at).getTime();
    }
    if (sort === 'cost') return Number(right.attempt?.actual_cost_usd || 0) - Number(left.attempt?.actual_cost_usd || 0);
    return new Date(right.job.created_at).getTime() - new Date(left.job.created_at).getTime();
  }), [branchItems, branchNames, filter, sort]);

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

  const remove = async () => {
    if (!removeItem) return;
    try {
      setWorkingId(removeItem.output_id);
      await deleteMediaGenerationOutput(removeItem.output_id);
      setItems(current => current.filter(item => item.output_id !== removeItem.output_id && item.source_output_id !== removeItem.output_id));
      setRemoveItem(null);
      addToast('Video deleted from storage and removed from Created media.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not remove this video.', 'error');
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

  const queuePlatformExport = async () => {
    if (!exportItem) return;
    try {
      setWorkingId(exportItem.output_id);
      await createMediaPlatformExport({ source_output_id: exportItem.output_id, platform: 'instagram_reel', framing: exportFraming, idempotency_key: crypto.randomUUID() });
      setExportItem(null);
      addToast('Instagram Reel export queued. This uses the existing server, not RunPod.', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not queue the Instagram export.', 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-black text-slate-900">Created media</h2><p className="mt-1 text-xs text-slate-500">Every completed generation, its source prompt, measured cost, approval, and publishing history.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">{(['all', 'needs_approval', 'approved', 'publishing'] as LibraryFilter[]).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${filter === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{value.replace('_', ' ')} <span className={filter === value ? 'text-indigo-200' : 'text-slate-400'}>{statusCounts[value]}</span></button>)}</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500"><Filter className="h-4 w-4 text-indigo-600" /><span className="sr-only">Filter by branch</span><select aria-label="Filter by branch" value={branchFilter} onChange={event => setBranchFilter(event.target.value)} className="min-w-44 bg-transparent text-xs font-bold text-slate-700 outline-none"><option value="all">All branches</option><option value="personal">Personal / unassigned</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500"><ArrowUpDown className="h-4 w-4 text-indigo-600" /><span className="sr-only">Sort media</span><select aria-label="Sort media" value={sort} onChange={event => setSort(event.target.value as LibrarySort)} className="min-w-36 bg-transparent text-xs font-bold text-slate-700 outline-none"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="branch">Branch A–Z</option><option value="cost">Highest cost</option></select></label>
          </div>
        </div>
      </section>

      {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div> : visibleItems.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Film className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">No generated videos match these filters.</p></div> : <div className="space-y-2">
        {visibleItems.map(item => {
          const latestPublication = item.publishing[0];
          const finishingActive = item.finishing && ['queued', 'running', 'cancel_requested'].includes(item.finishing.status);
          const exportActive = item.platform_export && ['queued', 'running', 'cancel_requested'].includes(item.platform_export.status);
          const reelReady = item.platform_export?.status === 'succeeded' && Boolean(item.platform_export.signed_url);
          const branchName = item.project?.branch_id ? branchNames.get(item.project.branch_id) || 'Unknown branch' : 'Personal';
          return <article key={item.output_id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
            <div className="grid gap-3 md:grid-cols-[168px_minmax(0,1fr)] md:items-center">
              <div className="aspect-video overflow-hidden rounded-xl bg-black">{item.signed_url ? <video controls preload="metadata" src={item.signed_url} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-[10px] font-bold text-slate-400">Preview unavailable</div>}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{item.project?.name || 'Media project'}</p><span className="text-slate-300">·</span><span className="text-[10px] font-black uppercase text-slate-500">{branchName}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.output_role === 'finished' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>{item.output_role === 'finished' ? 'Finished' : 'Original'}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.approved ? 'Approved' : 'Needs approval'}</span>
                  <div role="group" aria-label="Video actions" className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button type="button" aria-label={exportActive ? 'Exporting Instagram Reel' : 'Create Instagram Reel'} disabled={Boolean(exportActive) || workingId === item.output_id} onClick={() => { setExportFraming('blur_background'); setExportItem(item); }} title="Create a 1080×1920 Instagram Reel version" className="flex h-8 w-8 items-center justify-center rounded-lg text-fuchsia-600 transition-colors hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40">{exportActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}</button>
                    {item.output_role === 'primary' && <button type="button" aria-label={finishingActive ? 'Rendering text' : 'Edit text'} disabled={!finishingEnabled || Boolean(finishingActive)} onClick={() => setEditItem(item)} title={finishingEnabled ? 'Edit text' : 'Text finishing is paused until the rendering worker is online'} className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-600 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40">{finishingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}</button>}
                    {!item.approved && <button type="button" aria-label="Approve video" title="Approve video" disabled={workingId === item.output_id} onClick={() => void approve(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /></button>}
                    {item.approved && <button type="button" aria-label="Send to publishing" disabled={!publishingEnabled || workingId === item.output_id} onClick={() => openPublishing(item)} title={publishingEnabled ? 'Send to publishing' : 'Publishing handoff is paused until the private-media resolver is deployed'} className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-600 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>}
                    {(reelReady ? item.platform_export?.signed_url : item.signed_url) && <a href={reelReady ? item.platform_export?.signed_url || undefined : item.signed_url || undefined} download aria-label="Download video" title={reelReady ? 'Download Instagram Reel (1080×1920)' : 'Download video'} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200"><Download className="h-4 w-4" /></a>}
                    <button type="button" aria-label="Remove video" disabled={workingId === item.output_id || Boolean(finishingActive)} onClick={() => setRemoveItem(item)} title="Permanently delete this video from storage" className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-slate-800" title={item.job.prompt}>{item.job.prompt}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500"><span>{new Date(item.job.created_at).toLocaleDateString()}</span><span>{item.job.task_type.replaceAll('_', ' ')}</span><span>{item.asset.duration_seconds ? `${Number(item.asset.duration_seconds).toFixed(1)} sec` : 'Duration pending'}</span><span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{item.attempt?.actual_cost_usd == null ? 'Cost pending' : `$${Number(item.attempt.actual_cost_usd).toFixed(2)}`}</span>{latestPublication && <span className="text-indigo-600">{latestPublication.platform} · {latestPublication.status}</span>}</div>
                {item.finishing && item.output_role === 'primary' && <p className={`mt-2 text-[10px] font-bold ${item.finishing.status === 'failed' ? 'text-rose-700' : item.finishing.status === 'succeeded' ? 'text-emerald-700' : 'text-violet-700'}`}>{item.finishing.status === 'succeeded' ? 'Finished text version ready' : item.finishing.status === 'failed' ? `Finishing failed: ${item.finishing.error_message || 'Try again.'}` : `Finishing: ${item.finishing.status} · ${item.finishing.progress}%`}</p>}
                {item.platform_export && <p className={`mt-1 text-[10px] font-bold ${item.platform_export.status === 'failed' ? 'text-rose-700' : item.platform_export.status === 'succeeded' ? 'text-fuchsia-700' : 'text-indigo-700'}`}>{item.platform_export.status === 'succeeded' ? 'Instagram Reel ready · 1080×1920 · 30fps' : item.platform_export.status === 'failed' ? `Reel export failed: ${item.platform_export.error_message || 'Try again.'}` : `Instagram export: ${item.platform_export.status} · ${item.platform_export.progress}%`}</p>}
              </div>
              {(item.approved && !publishingEnabled) || (item.output_role === 'primary' && !finishingEnabled) ? <p className="flex items-start gap-2 text-[10px] leading-4 text-amber-700 md:col-span-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.approved && !publishingEnabled ? 'Publishing is paused until the private-media resolver is deployed.' : 'Text finishing is paused until its renderer is online.'}</p> : null}
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
      {exportItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create Instagram Reel">
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-fuchsia-50 p-3"><Instagram className="h-5 w-5 text-fuchsia-600" /></div><div><h3 className="text-lg font-black text-slate-900">Create Instagram Reel</h3><p className="text-xs text-slate-500">Convert this video to 1080×1920 at 30fps on the Trellis server.</p></div></div>
          <div className="mt-5 space-y-2">
            {([
              ['blur_background', 'Blurred background', 'Recommended — keeps the full scene visible and fills the vertical frame.'],
              ['center_crop', 'Center crop', 'Fills the screen, but trims the left and right sides.'],
              ['fit', 'Fit on black', 'Keeps the full scene with simple space above and below.'],
            ] as const).map(([value, label, description]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${exportFraming === value ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-slate-200'}`}><input type="radio" name="reel-framing" value={value} checked={exportFraming === value} onChange={() => setExportFraming(value)} className="mt-1 accent-fuchsia-600" /><span><span className="block text-sm font-black text-slate-800">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span></label>)}
          </div>
          <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-[11px] font-bold leading-5 text-emerald-800">No RunPod GPU is started, so this export adds no GPU-generation charge.</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setExportItem(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={workingId === exportItem.output_id} onClick={() => void queuePlatformExport()} className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{workingId === exportItem.output_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />} Create Reel</button></div>
        </div>
      </div>}
      {removeItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Delete generated video">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-rose-50 p-3"><Trash2 className="h-5 w-5 text-rose-600" /></div><div><h3 className="text-lg font-black text-slate-900">Delete this video?</h3><p className="text-xs text-slate-500">The video file will be permanently deleted from storage.</p></div></div>
          <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs leading-5 text-rose-700">This cannot be undone. Trellis keeps only the small generation usage and cost record for accurate reporting. Videos in publishing must be removed from that queue first.</p>
          <p className="mt-3 line-clamp-2 text-xs font-bold leading-5 text-slate-800">{removeItem.job.prompt}</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={workingId === removeItem.output_id} onClick={() => setRemoveItem(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-40">Keep video</button><button type="button" disabled={workingId === removeItem.output_id} onClick={() => void remove()} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{workingId === removeItem.output_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete permanently</button></div>
        </div>
      </div>}
      {editItem && <MediaFinishingEditor item={editItem} branches={branches} addToast={addToast} onClose={() => setEditItem(null)} onQueued={load} />}
    </div>
  );
};

export default GeneratedMediaLibrary;

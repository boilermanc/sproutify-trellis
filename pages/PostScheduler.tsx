import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock, UploadCloud, ImagePlus, Loader2, X, Trash2, Clock,
  CheckCircle2, XCircle, AlertTriangle, Ban, Instagram, Facebook, Music,
  Send, Sparkles, Info, RefreshCw, Image as ImageIcon, Pencil, Save, Zap,
  Eye, Bookmark, Share2, Users, MousePointerClick, Video,
} from 'lucide-react';
import { BranchContext, ScheduledPost, NewScheduledPost } from '../types';
import {
  createScheduledPosts, fetchScheduledPosts, cancelScheduledPost,
  uploadPostMedia, buildSchedule, updateScheduledPost,
} from '../services/scheduledPostService';
import { fetchLatestInsights, getDisplayInsights, PostInsightSnapshot } from '../services/socialInsightsService';

interface PostSchedulerProps {
  branchContext?: BranchContext;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type Cadence = 'daily' | 'weekdays' | 'every_2_days' | 'weekly';
type Platform = 'instagram' | 'facebook' | 'tiktok';

interface StagingRow {
  localId: string;
  file: File;
  previewUrl: string;
  url: string | null;
  mediaType: 'image' | 'video';
  uploading: boolean;
  uploadError: string | null;
  caption: string;
  platform: Platform;
  scheduledFor: string; // ISO
}

// Local editing draft for a row already sitting in `scheduled_social_posts`.
// datetime-local input value + caption, kept separate from the ScheduledPost
// itself until Save is pressed.
interface EditDraft {
  scheduledFor: string; // datetime-local value
  caption: string;
}

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'every_2_days', label: 'Every 2 days' },
  { value: 'weekly', label: 'Weekly' },
];

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Instagram; color: string }> = {
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  facebook: { label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
  tiktok: { label: 'TikTok', icon: Music, color: 'text-slate-900' },
};

const STATUS_CHIP: Record<ScheduledPost['status'], { label: string; className: string; icon: typeof Clock }> = {
  scheduled: { label: 'Scheduled', className: 'bg-amber-50 text-amber-600', icon: Clock },
  publishing: { label: 'Publishing', className: 'bg-amber-100 text-amber-700 animate-pulse', icon: Loader2 },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-500', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-400', icon: Ban },
  needs_review: { label: 'Needs Review', className: 'bg-orange-50 text-orange-600', icon: AlertTriangle },
};

// Only a `scheduled` row is still waiting to go out — everything else is
// either in flight or already resolved, so editing it would be misleading.
function editBlockedReason(status: ScheduledPost['status']): string | null {
  switch (status) {
    case 'scheduled': return null;
    case 'publishing': return "Can't edit — this post is publishing right now.";
    case 'published': return "Can't edit — this post already went out.";
    case 'failed': return "Can't edit — this post failed and won't retry from here.";
    case 'cancelled': return "Can't edit — this post was cancelled.";
    default: return "Can't edit this post.";
  }
}

// Instagram and TikTok genuinely require media (TikTok has no text-only post
// at all); Facebook Page posts can go out as caption-only (the publish worker
// maps an empty media_urls to a text feed post). This is the single source of
// truth for both the Save button's disabled state and the per-row validation
// message, so they can never drift apart.
function rowBlockingReason(row: StagingRow): string | null {
  if (row.uploading) return 'still uploading';
  if (!row.caption.trim()) return 'needs a caption';
  if ((row.platform === 'instagram' || row.platform === 'tiktok') && !row.url) {
    return `needs media — ${row.platform === 'tiktok' ? 'TikTok' : 'Instagram'} requires an image or video`;
  }
  return null;
}

// datetime-local inputs work in local time strings with no timezone —
// convert to/from ISO explicitly so we don't silently drift to UTC.
function isoToLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

// Resolves a datetime-local value back to an absolute, human-readable
// string ("Fri, Aug 1 · 5:45 PM") so a wrong DATE — the exact mistake this
// edit flow exists to fix — is obvious before Save, not after.
function fmtResolvedLocalValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isLocalValueInPast(value: string): boolean {
  const iso = localInputValueToIso(value);
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

function todayDateInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let rowIdCounter = 0;
const nextRowId = () => `row_${Date.now()}_${rowIdCounter++}`;

// Compact display for insight badges ("1.2K" instead of "1234") — these are
// small pills next to a status chip, not a report, so precision beyond one
// decimal just adds noise.
function fmtCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Same compact formatting, but null-safe — a Facebook metric that never
// synced (or doesn't apply) renders as "—", never a fabricated 0.
function fmtCompactOrDash(n: number | null): string {
  return n === null ? '—' : fmtCompactCount(n);
}

const PostScheduler: React.FC<PostSchedulerProps> = ({ branchContext, addToast }) => {
  // ── Branch selection ──
  const branchOptions = branchContext?.allBranches ?? [];
  const [branchId, setBranchId] = useState('');
  useEffect(() => {
    if (!branchId && branchOptions.length > 0) setBranchId(branchOptions[0].id);
  }, [branchOptions, branchId]);
  const selectedBranch = branchOptions.find(b => b.id === branchId) || null;

  // Queue shows every brand's posts, so each row needs its brand name resolved
  // from slug. Falls back to the raw slug for any brand not in the picker.
  const brandNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    branchOptions.forEach(b => m.set(b.slug, b.name));
    return m;
  }, [branchOptions]);
  const brandName = (slug: string | null | undefined) => (slug ? brandNameBySlug.get(slug) ?? slug : 'Unknown');

  // ── Staging rows (uploaded, not yet saved) ──
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-schedule helper ──
  const [scheduleStart, setScheduleStart] = useState(todayDateInputValue());
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [cadence, setCadence] = useState<Cadence>('daily');

  // ── Bulk caption helper ──
  const [bulkCaption, setBulkCaption] = useState('');

  // ── Queue ──
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ── Queue view controls (all brands, filterable + sortable) ──
  const [queueBrandFilter, setQueueBrandFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'auto' | 'date_asc' | 'date_desc' | 'brand' | 'status'>('auto');

  // ── Inline edit of a queued (still `scheduled`) row ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  // ── Per-post insights for History rows (platform-aware — Instagram gets
  // saves/shares/impressions, Facebook gets impressions/reach/engagement) ──
  const [postInsights, setPostInsights] = useState<Map<string, PostInsightSnapshot>>(new Map());
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Queue is brand-agnostic now — it loads every brand's posts so the whole
  // schedule is visible in one place. The brand picker above drives uploads
  // only; the queue's own filter (below) narrows what's shown.
  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const posts = await fetchScheduledPosts();
      setQueue(posts);
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to load the scheduled queue.', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => { loadQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload handling ──
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!selectedBranch) { addToast?.('Choose a brand before uploading media.', 'error'); return; }

    const files = Array.from(fileList).filter(f => {
      const isImage = f.type.startsWith('image/');
      const isVideo = f.type.startsWith('video/');
      if (!isImage && !isVideo) {
        addToast?.(`${f.name} is not an image or video — skipped.`, 'error');
        return false;
      }
      const limitMb = isVideo ? 50 : 10;
      if (f.size > limitMb * 1024 * 1024) {
        addToast?.(`${f.name} is over ${limitMb}MB — skipped.`, 'error');
        return false;
      }
      return true;
    });
    if (files.length === 0) return;

    const newRows: StagingRow[] = files.map(file => ({
      localId: nextRowId(),
      file,
      previewUrl: URL.createObjectURL(file),
      url: null,
      mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      uploading: true,
      uploadError: null,
      caption: '',
      platform: 'instagram',
      scheduledFor: new Date().toISOString(),
    }));
    setRows(prev => [...prev, ...newRows]);

    for (const row of newRows) {
      try {
        const url = await uploadPostMedia(selectedBranch.slug, row.file);
        setRows(prev => prev.map(r => (r.localId === row.localId ? { ...r, url, uploading: false } : r)));
      } catch (e) {
        const message = e instanceof Error ? e.message : `Failed to upload ${row.file.name}.`;
        setRows(prev => prev.map(r => (r.localId === row.localId ? { ...r, uploading: false, uploadError: message } : r)));
        addToast?.(message, 'error');
      }
    }
  };

  const updateRow = (localId: string, patch: Partial<StagingRow>) => {
    setRows(prev => prev.map(r => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    setRows(prev => {
      const row = prev.find(r => r.localId === localId);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter(r => r.localId !== localId);
    });
  };

  // ── Auto-schedule: fill every row's date via buildSchedule ──
  const applyAutoSchedule = () => {
    if (rows.length === 0) { addToast?.('Add some images first.', 'error'); return; }
    const startIso = new Date(`${scheduleStart}T${scheduleTime || '09:00'}:00`).toISOString();
    const dates = buildSchedule(startIso, rows.length, cadence, scheduleTime || '09:00');
    setRows(prev => prev.map((r, i) => ({ ...r, scheduledFor: dates[i] || r.scheduledFor })));
    addToast?.(`Applied a ${cadence.replace('_', ' ')} schedule across ${rows.length} post${rows.length === 1 ? '' : 's'}.`, 'success');
  };

  // ── Bulk caption: append to every row's caption ──
  const applyBulkCaption = () => {
    if (!bulkCaption.trim()) return;
    if (rows.length === 0) { addToast?.('Add some images first.', 'error'); return; }
    setRows(prev => prev.map(r => ({
      ...r,
      caption: r.caption.trim() ? `${r.caption.trim()}\n\n${bulkCaption.trim()}` : bulkCaption.trim(),
    })));
    addToast?.('Appended to every caption.', 'success');
  };

  // ── Save to queue ──
  // "Ready" (for the progress label below) still means "image attached" —
  // that's distinct from "saveable", which a medialess Facebook row is.
  const readyRows = rows.filter(r => r.url && !r.uploading);
  const canSave = !!selectedBranch && rows.length > 0 && rows.every(r => !rowBlockingReason(r));

  const handleSave = async () => {
    if (!selectedBranch) { addToast?.('Choose a brand first.', 'error'); return; }
    if (rows.length === 0) { addToast?.('Add some images first.', 'error'); return; }

    const blockedIndex = rows.findIndex(r => rowBlockingReason(r) !== null);
    if (blockedIndex !== -1) {
      const row = rows[blockedIndex];
      const reason = rowBlockingReason(row);
      const label = row.caption.trim() ? `"${row.caption.trim().slice(0, 40)}"` : `Row ${blockedIndex + 1}`;
      addToast?.(`${label} ${reason}.`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: NewScheduledPost[] = rows.map(r => ({
        branch_id: selectedBranch.id,
        branch_slug: selectedBranch.slug,
        platform: r.platform,
        caption: r.caption.trim(),
        media_type: r.mediaType,
        media_urls: r.url ? [r.url] : [],
        scheduled_for: r.scheduledFor,
        source: 'upload',
      }));
      const created = await createScheduledPosts(payload);
      addToast?.(`Queued ${created.length} post${created.length === 1 ? '' : 's'} for ${selectedBranch.name}.`, 'success');
      rows.forEach(r => URL.revokeObjectURL(r.previewUrl));
      setRows([]);
      setBulkCaption('');
      loadQueue();
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to queue the posts.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Cancel a queued post ──
  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelScheduledPost(id);
      addToast?.('Post cancelled.', 'success');
      setQueue(prev => prev.map(p => (p.id === id ? { ...p, status: 'cancelled' } : p)));
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to cancel that post.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  // ── Inline edit: reschedule / re-caption a `scheduled` row ──
  const startEdit = (post: ScheduledPost) => {
    if (post.status !== 'scheduled') return;
    setEditingId(post.id);
    setEditDraft({ scheduledFor: isoToLocalInputValue(post.scheduled_for), caption: post.caption });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleSaveEdit = async (post: ScheduledPost) => {
    if (!editDraft) return;
    if (!editDraft.caption.trim()) { addToast?.('Caption cannot be empty.', 'error'); return; }
    if (isLocalValueInPast(editDraft.scheduledFor)) {
      addToast?.('That date/time is in the past — pick a future date/time before saving.', 'error');
      return;
    }

    setSavingEditId(post.id);
    try {
      const updated = await updateScheduledPost(post.id, {
        scheduled_for: localInputValueToIso(editDraft.scheduledFor),
        caption: editDraft.caption.trim(),
      });
      setQueue(prev => prev.map(p => (p.id === post.id ? updated : p)));
      addToast?.('Post updated.', 'success');
      setEditingId(null);
      setEditDraft(null);
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to update that post.', 'error');
    } finally {
      setSavingEditId(null);
    }
  };

  // The exact fix for "I meant today, not tomorrow" — jump straight to now
  // so the next worker pass (~10 min) picks it up, no date math required.
  const handleRescheduleNow = async (post: ScheduledPost) => {
    setReschedulingId(post.id);
    try {
      const updated = await updateScheduledPost(post.id, { scheduled_for: new Date().toISOString() });
      setQueue(prev => prev.map(p => (p.id === post.id ? updated : p)));
      addToast?.('Rescheduled to now — the next worker pass will pick it up.', 'success');
      if (editingId === post.id) { setEditingId(null); setEditDraft(null); }
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to reschedule that post.', 'error');
    } finally {
      setReschedulingId(null);
    }
  };

  // ── Queue split: upcoming vs. history ──
  // Shared brand-filter + sort applied to both sections. `auto` keeps the
  // sensible defaults (upcoming soonest-first, history most-recent-first);
  // any explicit choice overrides both lists.
  const applyView = useMemo(() => {
    const byDateAsc = (a: ScheduledPost, b: ScheduledPost) =>
      new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
    return (list: ScheduledPost[], isHistory: boolean): ScheduledPost[] => {
      const out = (queueBrandFilter === 'all' ? list : list.filter(p => p.branch_slug === queueBrandFilter)).slice();
      switch (sortMode) {
        case 'date_asc': out.sort(byDateAsc); break;
        case 'date_desc': out.sort((a, b) => -byDateAsc(a, b)); break;
        case 'brand': out.sort((a, b) => brandName(a.branch_slug).localeCompare(brandName(b.branch_slug)) || byDateAsc(a, b)); break;
        case 'status': out.sort((a, b) => a.status.localeCompare(b.status) || byDateAsc(a, b)); break;
        default: out.sort((a, b) => (isHistory ? -byDateAsc(a, b) : byDateAsc(a, b)));
      }
      return out;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueBrandFilter, sortMode, brandNameBySlug]);

  const upcoming = useMemo(
    () => applyView(queue.filter(p => p.status === 'scheduled' || p.status === 'publishing'), false),
    [queue, applyView],
  );
  const history = useMemo(
    () => applyView(
      queue.filter(p => p.status === 'published' || p.status === 'failed' || p.status === 'cancelled' || p.status === 'needs_review'),
      true,
    ),
    [queue, applyView],
  );

  // ── Load insights for published posts with a real platform post id —
  // Instagram media synced by S2-instagram-insights-sync, Facebook Page
  // posts synced by a separate job. Both land in the same table. ──
  const insightablePostIds = useMemo(
    () => history.filter(p => p.status === 'published' && p.post_id).map(p => p.id),
    [history],
  );
  const insightablePostIdsKey = insightablePostIds.join(',');

  useEffect(() => {
    if (insightablePostIds.length === 0) { setPostInsights(new Map()); return; }
    let cancelled = false;
    setInsightsLoading(true);
    fetchLatestInsights(insightablePostIds)
      .then(map => { if (!cancelled) setPostInsights(map); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightablePostIdsKey]);

  const fmtDateTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="p-6 lg:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <CalendarClock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Post Scheduler</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Bring your own creative — upload, caption, and queue a week in one go
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadQueue}
          disabled={queueLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {queueLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          An n8n worker checks for due posts roughly every 10 minutes and publishes them. Scheduled times are approximate to that window,
          not to-the-second.
        </p>
      </div>

      {/* Brand selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Brand</span>
        {branchOptions.length === 0 ? (
          <p className="text-sm text-slate-400">No brands available yet.</p>
        ) : (
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="w-full lg:w-80 text-sm font-bold border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {branchOptions.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Drop zone */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ImagePlus className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Drop This Week's Images</h2>
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-4 py-10 text-sm transition cursor-pointer ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
              : 'border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-500'
          }`}
        >
          <UploadCloud size={20} />
          <span className="font-bold">{isDragging ? 'Drop the media here' : 'Drag images or videos here, or click to browse'}</span>
          <span className="text-xs text-slate-300">Images up to 10MB · MP4 video up to 50MB · multiple files at once</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {rows.length > 0 && (
          <>
            {/* Auto-schedule helper */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auto-schedule all rows</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start date</span>
                  <input
                    type="date"
                    value={scheduleStart}
                    onChange={e => setScheduleStart(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Time of day</span>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cadence</span>
                  <select
                    value={cadence}
                    onChange={e => setCadence(e.target.value as Cadence)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    {CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={applyAutoSchedule}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply to all {rows.length} row{rows.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>

            {/* Bulk caption helper */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bulk caption add-on</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Creative Studio posts get the brand's default CTA automatically — uploads don't, so add a standing CTA or hashtag set here
                and apply it to every row at once.
              </p>
              <div className="flex flex-col lg:flex-row gap-2">
                <textarea
                  value={bulkCaption}
                  onChange={e => setBulkCaption(e.target.value)}
                  placeholder="e.g. Shop the link in bio 🌱 #atlurbanfarms"
                  rows={2}
                  className="flex-1 text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
                />
                <button
                  type="button"
                  onClick={applyBulkCaption}
                  disabled={!bulkCaption.trim()}
                  className="shrink-0 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition disabled:opacity-40"
                >
                  Append to all captions
                </button>
              </div>
            </div>

            {/* Staging rows */}
            <div className="space-y-3">
              {rows.map(row => {
                const needsImage = (row.platform === 'instagram' || row.platform === 'tiktok') && !row.url;
                const imageOptional = row.platform === 'facebook' && !row.url;
                return (
                <div key={row.localId} className="flex flex-col lg:flex-row gap-3 border border-slate-200 rounded-xl p-3">
                  <div className="relative w-full lg:w-28 h-28 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                    {row.mediaType === 'video' ? <video src={row.previewUrl} muted playsInline className="w-full h-full object-cover" /> : <img src={row.previewUrl} alt="" className="w-full h-full object-cover" />}
                    {row.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                      </div>
                    )}
                    {row.uploadError && (
                      <div className="absolute inset-0 bg-rose-500/80 flex items-center justify-center" title={row.uploadError}>
                        <AlertTriangle className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <textarea
                      value={row.caption}
                      onChange={e => updateRow(row.localId, { caption: e.target.value })}
                      placeholder="Write a caption…"
                      rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={row.platform}
                        onChange={e => updateRow(row.localId, { platform: e.target.value as Platform })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                        <option value="tiktok">TikTok</option>
                      </select>
                      <input
                        type="datetime-local"
                        value={isoToLocalInputValue(row.scheduledFor)}
                        onChange={e => updateRow(row.localId, { scheduledFor: localInputValueToIso(e.target.value) })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      />
                      {row.uploadError && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedBranch) return;
                            updateRow(row.localId, { uploading: true, uploadError: null });
                            try {
                              const url = await uploadPostMedia(selectedBranch.slug, row.file);
                              updateRow(row.localId, { url, uploading: false });
                            } catch (e) {
                              updateRow(row.localId, { uploading: false, uploadError: e instanceof Error ? e.message : 'Upload failed.' });
                            }
                          }}
                          className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          Retry upload
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        className="ml-auto flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                    {needsImage && (
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-500">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Media required for {row.platform === 'tiktok' ? 'TikTok' : 'Instagram'} — upload an image or video, retry the failed upload, or switch this row to Facebook.
                      </p>
                    )}
                    {imageOptional && (
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Image optional for Facebook — this row can go out as a caption-only post.
                      </p>
                    )}
                    {row.platform === 'tiktok' && (
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        TikTok posts stay private (SELF_ONLY) until the app clears TikTok's audit — this row will not be publicly visible.
                      </p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {/* Save to queue */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              <p className="text-[11px] text-slate-400">
                {readyRows.length} of {rows.length} media file{rows.length === 1 ? '' : 's'} uploaded
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 shadow-sm"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Save {rows.length} to Queue
              </button>
            </div>
          </>
        )}

        {rows.length === 0 && (
          <p className="text-center text-xs text-slate-300 py-2">No media staged yet — drop images or videos above.</p>
        )}
      </div>

      {/* Queue list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
              Scheduled Queue · {queueBrandFilter === 'all' ? 'All Brands' : brandName(queueBrandFilter)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={queueBrandFilter}
              onChange={e => setQueueBrandFilter(e.target.value)}
              title="Filter the queue by brand"
              className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="all">All brands</option>
              {branchOptions.map(b => <option key={b.id} value={b.slug}>{b.name}</option>)}
            </select>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as typeof sortMode)}
              title="Sort the queue"
              className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="auto">Sort: Default</option>
              <option value="date_asc">Date ↑ (soonest)</option>
              <option value="date_desc">Date ↓ (latest)</option>
              <option value="brand">Brand (A–Z)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {queueLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Upcoming */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Upcoming</span>
              {upcoming.length === 0 ? (
                <p className="text-xs text-slate-300 py-3">
                  {queueBrandFilter === 'all' ? 'Nothing scheduled yet.' : `Nothing scheduled yet for ${brandName(queueBrandFilter)}.`}
                </p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(post => {
                    const chip = STATUS_CHIP[post.status];
                    const platformMeta = PLATFORM_META[post.platform] ?? PLATFORM_META.instagram;
                    const PlatformIcon = platformMeta.icon;
                    const ChipIcon = chip.icon;
                    const isEditing = editingId === post.id;
                    const blockedReason = editBlockedReason(post.status);
                    const editIsPast = isEditing && editDraft ? isLocalValueInPast(editDraft.scheduledFor) : false;
                    return (
                      <div key={post.id} className="border border-slate-100 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center gap-3">
                          {post.media_urls[0] ? (
                            post.media_type === 'video'
                              ? <video src={post.media_urls[0]} muted playsInline preload="metadata" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                              : <img src={post.media_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              {post.media_type === 'video' ? <Video className="w-4 h-4 text-slate-300" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            {!isEditing && <p className="text-xs font-bold text-slate-700 truncate">{post.caption || '(no caption)'}</p>}
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold uppercase tracking-widest">{brandName(post.branch_slug)}</span>
                              <PlatformIcon className={`w-3 h-3 ${platformMeta.color}`} />
                              <span>{platformMeta.label}</span>
                              <span>·</span>
                              <span>{fmtDateTime(post.scheduled_for)}</span>
                            </div>
                          </div>
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 ${chip.className}`}>
                            <ChipIcon className={`w-3 h-3 ${post.status === 'publishing' ? 'animate-spin' : ''}`} />
                            {chip.label}
                          </span>
                          {!isEditing && (
                            blockedReason ? (
                              <span title={blockedReason} className="shrink-0 text-slate-200 cursor-not-allowed">
                                <Pencil className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(post)}
                                title="Edit time or caption"
                                className="shrink-0 text-slate-400 hover:text-emerald-600 transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                          {!isEditing && post.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => handleRescheduleNow(post)}
                              disabled={reschedulingId === post.id}
                              title="Reschedule to now — next worker pass picks it up"
                              className="shrink-0 text-slate-400 hover:text-emerald-600 transition disabled:opacity-40"
                            >
                              {reschedulingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {!isEditing && post.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => handleCancel(post.id)}
                              disabled={cancellingId === post.id}
                              className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition disabled:opacity-40"
                            >
                              {cancellingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cancel'}
                            </button>
                          )}
                        </div>

                        {isEditing && editDraft && (
                          <div className="pl-[52px] space-y-2 border-t border-slate-100 pt-2">
                            <textarea
                              value={editDraft.caption}
                              onChange={e => setEditDraft(d => (d ? { ...d, caption: e.target.value } : d))}
                              rows={2}
                              placeholder="Write a caption…"
                              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="datetime-local"
                                value={editDraft.scheduledFor}
                                onChange={e => setEditDraft(d => (d ? { ...d, scheduledFor: e.target.value } : d))}
                                className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                                  editIsPast ? 'border-rose-300' : 'border-slate-200'
                                }`}
                              />
                              <span className="text-[11px] font-bold text-slate-500">
                                {fmtResolvedLocalValue(editDraft.scheduledFor)}
                              </span>
                            </div>
                            {editIsPast && (
                              <p className="flex items-center gap-1.5 text-[11px] font-bold text-rose-500">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                That date/time has already passed — pick a future date/time before saving.
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(post)}
                                disabled={savingEditId === post.id || editIsPast || !editDraft.caption.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-black uppercase tracking-widest transition disabled:opacity-40"
                              >
                                {savingEditId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEditId === post.id}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* History */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">History</span>
              {history.length === 0 ? (
                <p className="text-xs text-slate-300 py-3">No published, failed, or cancelled posts yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(post => {
                    const chip = STATUS_CHIP[post.status];
                    const platformMeta = PLATFORM_META[post.platform] ?? PLATFORM_META.instagram;
                    const PlatformIcon = platformMeta.icon;
                    const ChipIcon = chip.icon;
                    const blockedReason = editBlockedReason(post.status);
                    return (
                      <div key={post.id} className="border border-slate-100 rounded-xl p-2.5 space-y-1.5">
                        <div className="flex items-center gap-3">
                          {post.media_urls[0] ? (
                            post.media_type === 'video'
                              ? <video src={post.media_urls[0]} muted playsInline preload="metadata" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                              : <img src={post.media_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              {post.media_type === 'video' ? <Video className="w-4 h-4 text-slate-300" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-700 truncate">{post.caption || '(no caption)'}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold uppercase tracking-widest">{brandName(post.branch_slug)}</span>
                              <PlatformIcon className={`w-3 h-3 ${platformMeta.color}`} />
                              <span>{platformMeta.label}</span>
                              <span>·</span>
                              <span>{fmtDateTime(post.scheduled_for)}</span>
                            </div>
                          </div>
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 ${chip.className}`}>
                            <ChipIcon className="w-3 h-3" />
                            {chip.label}
                          </span>
                          {blockedReason && (
                            <span title={blockedReason} className="shrink-0 text-slate-200 cursor-not-allowed">
                              <Pencil className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        {post.status === 'failed' && post.last_error && (
                          <p className="text-[10px] text-rose-500 pl-[52px]">{post.last_error}</p>
                        )}
                        {post.status === 'published' && post.post_id && (
                          <div className="pl-[52px]">
                            {(() => {
                              const snapshot = postInsights.get(post.id);
                              if (snapshot) {
                                const display = getDisplayInsights(snapshot);
                                if (display.platform === 'facebook') {
                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                        <Eye className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactOrDash(display.impressions)} Impressions</span>
                                      </span>
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                        <Users className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactOrDash(display.engagedUsers)} Engaged</span>
                                      </span>
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                        <MousePointerClick className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactOrDash(display.clicks)} Clicks</span>
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                      <Bookmark className="w-3 h-3" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactOrDash(display.saves)} Saves</span>
                                    </span>
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                      <Share2 className="w-3 h-3" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactCount(display.shares)} Shares</span>
                                    </span>
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                      <Eye className="w-3 h-3" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest">{fmtCompactCount(display.impressions)} Impressions</span>
                                    </span>
                                  </div>
                                );
                              }
                              if (insightsLoading) {
                                return (
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Loading insights…
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                  No insights yet — check back in a few hours
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PostScheduler;

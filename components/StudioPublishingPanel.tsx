import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, ExternalLink, Loader2, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { Branch, BranchSocialAccountsMap, StudioAlbum, StudioPublication, StudioPublicationDraft, YouTubeDailyMetric } from '../types';
import { approveStudioPublication, getStudioYouTubeMetrics, prepareStudioPublication, publishStudioAlbum, saveStudioPublication } from '../services/studioAlbumsService';
import ConfirmationModal from './ConfirmationModal';
import YouTubeAccountSelector from './YouTubeAccountSelector';

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
function formatSyncAge(value?: string | null): string {
  if (!value) return 'unknown';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

type Props = {
  album: StudioAlbum;
  publication: StudioPublication | null;
  branches: Branch[];
  branchSocialAccounts: BranchSocialAccountsMap;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onChange: (publication: StudioPublication) => void;
};

const EMPTY: StudioPublicationDraft = { title: '', description: '', tags: [], visibility: 'private', made_for_kids: false, scheduled_for: null };

const StudioPublishingPanel: React.FC<Props> = ({ album, publication, branches, branchSocialAccounts, addToast, onChange }) => {
  const [draft, setDraft] = useState<StudioPublicationDraft>(EMPTY);
  const [busy, setBusy] = useState<'prepare' | 'save' | 'approve' | 'publish' | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [youtubeAccountId, setYoutubeAccountId] = useState(publication?.youtube_account_id || '');
  const [metrics, setMetrics] = useState<YouTubeDailyMetric[]>([]);
  const [metricsBusy, setMetricsBusy] = useState(false);

  useEffect(() => {
    if (!publication) return setDraft(EMPTY);
    setDraft({ title: publication.title, description: publication.description, tags: publication.tags || [], visibility: publication.visibility, made_for_kids: publication.made_for_kids, scheduled_for: publication.scheduled_for });
    if (publication.youtube_account_id) setYoutubeAccountId(publication.youtube_account_id);
  }, [publication]);

  const refreshMetrics = useCallback(async () => {
    setMetricsBusy(true);
    try { setMetrics(await getStudioYouTubeMetrics(album.id)); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not load YouTube analytics.', 'error'); }
    finally { setMetricsBusy(false); }
  }, [album.id, addToast]);

  useEffect(() => { if (publication?.status === 'live') void refreshMetrics(); else setMetrics([]); }, [publication?.status, publication?.id, refreshMetrics]);

  const latestMetric = metrics[0];
  const sevenDayMetrics = metrics.slice(0, 7);
  const sevenDayViews = sevenDayMetrics.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const sevenDayWatchMinutes = sevenDayMetrics.reduce((sum, row) => sum + Number(row.estimated_minutes_watched || 0), 0);
  const totalViews = (latestMetric?.raw?.public_statistics as Record<string, unknown> | undefined)?.viewCount;
  const totalViewsNumber = totalViews != null ? Number(totalViews) : null;

  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<StudioPublication>, success: string) => {
    setBusy(kind);
    try { const next = await work(); onChange(next); addToast(success, 'success'); return true; }
    catch (error) { addToast(error instanceof Error ? error.message : 'Publishing action failed.', 'error'); return false; }
    finally { setBusy(null); }
  };

  const confirmYouTubeSubmission = async () => {
    const submitted = await run('publish', () => publishStudioAlbum(album.id, youtubeAccountId), 'Album submitted to the YouTube publishing workflow.');
    if (submitted) setConfirmPublish(false);
  };

  const locked = publication?.status === 'submitting' || publication?.status === 'live';
  const tagText = draft.tags.join(', ');

  return <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6">
    <div className="flex flex-wrap items-start gap-4">
      <div className="mr-auto"><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Step 7 · Publishing</p><h3 className="mt-1 text-lg font-black text-sky-950">Review before YouTube</h3><p className="mt-1 max-w-2xl text-sm text-sky-800">Nothing is submitted until metadata is saved, approved, and explicitly sent. New releases default to private.</p></div>
      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700">{publication?.status?.replaceAll('_', ' ') || 'not prepared'}</span>
    </div>
    {!publication && <div className="mt-5 grid max-w-xl gap-3">
      <YouTubeAccountSelector branchSlug="rekkrd" branches={branches} accountsByBranch={branchSocialAccounts} value={youtubeAccountId} onChange={setYoutubeAccountId} disabled={busy !== null} />
      <p className="text-[10px] font-medium text-slate-500">Choose the destination now. You can change it until submission begins.</p>
      <button type="button" onClick={() => run('prepare', () => prepareStudioPublication(album.id, youtubeAccountId), 'Publishing draft prepared. Review every field before approval.')} disabled={busy !== null || !youtubeAccountId} className="w-fit inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'prepare' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Prepare metadata</button>
    </div>}
    {publication && <>
      {publication.status === 'live' && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4"><Check size={18} className="text-emerald-700" /><div className="mr-auto"><p className="text-xs font-black uppercase tracking-widest text-emerald-800">Live on YouTube</p>{publication.published_at && <p className="mt-0.5 text-[11px] text-emerald-700">Published {new Date(publication.published_at).toLocaleString()}</p>}</div>{publication.external_url && <a href={publication.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white"><ExternalLink size={16} /> Watch on YouTube</a>}</div>}
      {publication.status === 'live' && <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-sky-900"><BarChart3 size={14} className="text-red-500" /> YouTube Analytics</h4>
            <p className="mt-1 text-[11px] font-medium text-slate-400">{latestMetric ? `Last synced ${formatSyncAge(latestMetric.synced_at)}` : 'Waiting for the YouTube analytics sync.'}</p>
          </div>
          <button type="button" onClick={() => void refreshMetrics()} disabled={metricsBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-200 disabled:opacity-40">
            {metricsBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>
        {!latestMetric ? (
          <p className="mt-3 text-[11px] font-medium text-slate-400">Next step is the scheduled YouTube sync job. Once it writes to <b>trellis_youtube_daily_metrics</b>, this panel fills in automatically.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                ['Total Views', totalViewsNumber != null ? formatMetricNumber(totalViewsNumber) : formatMetricNumber(sevenDayViews)],
                ['7-Day Watch', `${formatWatchHours(sevenDayWatchMinutes)} hr`],
                ['Avg View', formatDurationSeconds(latestMetric.average_view_duration)],
                ['Retention', `${formatMetricNumber(latestMetric.average_view_percentage)}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="mt-0.5 text-base font-black text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                ['7-Day Views', formatMetricNumber(sevenDayViews)],
                ['Latest Day', formatMetricNumber(latestMetric.views)],
                ['Likes', formatMetricNumber(latestMetric.likes)],
                ['Comments', formatMetricNumber(latestMetric.comments)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-white p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="mt-0.5 text-xs font-black text-slate-700">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>}
      {publication.status === 'submitting' && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-300 bg-white p-4"><Loader2 size={18} className="animate-spin text-sky-700" /><p className="text-xs font-bold text-sky-900">Publishing to YouTube… this page updates automatically when it goes live.</p></div>}
      <div className="mt-5 grid gap-4">
        <div>
          <YouTubeAccountSelector branchSlug="rekkrd" branches={branches} accountsByBranch={branchSocialAccounts} value={youtubeAccountId} onChange={setYoutubeAccountId} disabled={locked || busy !== null} />
          <p className={`mt-1.5 text-[10px] font-medium ${locked ? 'text-amber-700' : 'text-slate-500'}`}>
            {locked ? 'Destination locked when this upload was submitted.' : 'You can change the channel until submission begins. Failed submissions can be retargeted before retry.'}
          </p>
        </div>
        <label className="text-xs font-bold text-slate-700">YouTube title<input value={draft.title} disabled={locked} maxLength={95} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">{draft.title.length}/95</span></label>
        <label className="text-xs font-bold text-slate-700">Description<textarea value={draft.description} disabled={locked} maxLength={4900} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} className="mt-1.5 min-h-40 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">{draft.description.length}/4900</span></label>
        <label className="text-xs font-bold text-slate-700">Search tags<input value={tagText} disabled={locked} onChange={event => setDraft(current => ({ ...current, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 15) }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">Comma-separated · maximum 15</span></label>
        <label className="block max-w-sm text-xs font-bold text-slate-700">Visibility<select value={draft.visibility} disabled={locked} onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as StudioPublicationDraft['visibility'] }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select><span className="mt-1 block text-[10px] font-medium text-slate-400">Scheduling stays disabled until the YouTube workflow supports it end to end.</span></label>
      </div>
      {publication.chapters?.length > 0 && <div className="mt-5 rounded-2xl bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Automatic chapters</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{publication.chapters.map(chapter => <p key={`${chapter.time}-${chapter.title}`} className="text-xs text-slate-600"><span className="font-black text-slate-900">{chapter.time}</span> {chapter.title}</p>)}</div></div>}
      {publication.status === 'failed' && publication.error_message && <div className="mt-4 rounded-xl bg-rose-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Last publish attempt failed</p><p className="mt-1 text-xs font-medium text-rose-700">{publication.error_message}</p></div>}
      <div className="mt-5 flex flex-wrap gap-3">
        {publication.status === 'draft' && <button type="button" onClick={() => run('prepare', () => prepareStudioPublication(album.id, youtubeAccountId), 'Fresh metadata written. Review it before approval.')} disabled={busy !== null || !youtubeAccountId} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-sky-800 disabled:opacity-50" title="Rewrite the AI description, tags, and chapters (replaces edits)">{busy === 'prepare' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Regenerate</button>}
        {!locked && <button type="button" onClick={() => run('save', () => saveStudioPublication(album.id, draft, youtubeAccountId), 'Publishing metadata saved.')} disabled={busy !== null || !youtubeAccountId || !draft.title.trim() || !draft.description.trim()} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-sky-800 disabled:opacity-50">{busy === 'save' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save draft</button>}
        {publication.status === 'draft' && <button type="button" onClick={() => run('approve', () => approveStudioPublication(album.id), 'Publishing metadata approved. The release is ready to submit.')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'approve' ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Approve metadata</button>}
        {(publication.status === 'ready' || publication.status === 'failed') && <button type="button" onClick={() => setConfirmPublish(true)} disabled={busy !== null || !youtubeAccountId} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'publish' ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} {publication.status === 'failed' ? 'Retry submit to YouTube' : 'Submit to YouTube'}</button>}
        {publication.external_url && <a href={publication.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white"><ExternalLink size={16} /> View release</a>}
      </div>
    </>}
    <ConfirmationModal open={confirmPublish} title="Submit this album to YouTube?" message={`Submit “${draft.title}” to YouTube with ${draft.visibility} visibility. The publishing workflow will begin immediately.`} confirmLabel="Submit to YouTube" busy={busy === 'publish'} onCancel={() => { if (!busy) setConfirmPublish(false); }} onConfirm={() => void confirmYouTubeSubmission()} />
  </section>;
};

export default StudioPublishingPanel;

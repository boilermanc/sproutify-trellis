import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Save, Send, Sparkles } from 'lucide-react';
import { StudioAlbum, StudioPublication, StudioPublicationDraft } from '../types';
import { approveStudioPublication, prepareStudioPublication, publishStudioAlbum, saveStudioPublication } from '../services/studioAlbumsService';
import ConfirmationModal from './ConfirmationModal';

type Props = {
  album: StudioAlbum;
  publication: StudioPublication | null;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onChange: (publication: StudioPublication) => void;
};

const EMPTY: StudioPublicationDraft = { title: '', description: '', tags: [], visibility: 'private', made_for_kids: false, scheduled_for: null };

const StudioPublishingPanel: React.FC<Props> = ({ album, publication, addToast, onChange }) => {
  const [draft, setDraft] = useState<StudioPublicationDraft>(EMPTY);
  const [busy, setBusy] = useState<'prepare' | 'save' | 'approve' | 'publish' | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  useEffect(() => {
    if (!publication) return setDraft(EMPTY);
    setDraft({ title: publication.title, description: publication.description, tags: publication.tags || [], visibility: publication.visibility, made_for_kids: publication.made_for_kids, scheduled_for: publication.scheduled_for });
  }, [publication]);

  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<StudioPublication>, success: string) => {
    setBusy(kind);
    try { const next = await work(); onChange(next); addToast(success, 'success'); return true; }
    catch (error) { addToast(error instanceof Error ? error.message : 'Publishing action failed.', 'error'); return false; }
    finally { setBusy(null); }
  };

  const confirmYouTubeSubmission = async () => {
    const submitted = await run('publish', () => publishStudioAlbum(album.id), 'Album submitted to the YouTube publishing workflow.');
    if (submitted) setConfirmPublish(false);
  };

  const locked = publication?.status === 'submitting' || publication?.status === 'live';
  const tagText = draft.tags.join(', ');

  return <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6">
    <div className="flex flex-wrap items-start gap-4">
      <div className="mr-auto"><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Step 7 · Publishing</p><h3 className="mt-1 text-lg font-black text-sky-950">Review before YouTube</h3><p className="mt-1 max-w-2xl text-sm text-sky-800">Nothing is submitted until metadata is saved, approved, and explicitly sent. New releases default to private.</p></div>
      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700">{publication?.status?.replaceAll('_', ' ') || 'not prepared'}</span>
    </div>
    {!publication && <button type="button" onClick={() => run('prepare', () => prepareStudioPublication(album.id), 'Publishing draft prepared. Review every field before approval.')} disabled={busy !== null} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'prepare' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Prepare metadata</button>}
    {publication && <>
      {publication.status === 'live' && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4"><Check size={18} className="text-emerald-700" /><div className="mr-auto"><p className="text-xs font-black uppercase tracking-widest text-emerald-800">Live on YouTube</p>{publication.published_at && <p className="mt-0.5 text-[11px] text-emerald-700">Published {new Date(publication.published_at).toLocaleString()}</p>}</div>{publication.external_url && <a href={publication.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white"><ExternalLink size={16} /> Watch on YouTube</a>}</div>}
      {publication.status === 'submitting' && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-300 bg-white p-4"><Loader2 size={18} className="animate-spin text-sky-700" /><p className="text-xs font-bold text-sky-900">Publishing to YouTube… this page updates automatically when it goes live.</p></div>}
      <div className="mt-5 grid gap-4">
        <label className="text-xs font-bold text-slate-700">YouTube title<input value={draft.title} disabled={locked} maxLength={95} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">{draft.title.length}/95</span></label>
        <label className="text-xs font-bold text-slate-700">Description<textarea value={draft.description} disabled={locked} maxLength={4900} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} className="mt-1.5 min-h-40 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">{draft.description.length}/4900</span></label>
        <label className="text-xs font-bold text-slate-700">Search tags<input value={tagText} disabled={locked} onChange={event => setDraft(current => ({ ...current, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 15) }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60" /><span className="mt-1 block text-[10px] font-medium text-slate-400">Comma-separated · maximum 15</span></label>
        <label className="block max-w-sm text-xs font-bold text-slate-700">Visibility<select value={draft.visibility} disabled={locked} onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as StudioPublicationDraft['visibility'] }))} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select><span className="mt-1 block text-[10px] font-medium text-slate-400">Scheduling stays disabled until the YouTube workflow supports it end to end.</span></label>
      </div>
      {publication.chapters?.length > 0 && <div className="mt-5 rounded-2xl bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Automatic chapters</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{publication.chapters.map(chapter => <p key={`${chapter.time}-${chapter.title}`} className="text-xs text-slate-600"><span className="font-black text-slate-900">{chapter.time}</span> {chapter.title}</p>)}</div></div>}
      {publication.error_message && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{publication.error_message}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {publication.status === 'draft' && <button type="button" onClick={() => run('prepare', () => prepareStudioPublication(album.id), 'Fresh metadata written. Review it before approval.')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-sky-800 disabled:opacity-50" title="Rewrite the AI description, tags, and chapters (replaces edits)">{busy === 'prepare' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Regenerate</button>}
        {!locked && <button type="button" onClick={() => run('save', () => saveStudioPublication(album.id, draft), 'Publishing metadata saved.')} disabled={busy !== null || !draft.title.trim() || !draft.description.trim()} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-sky-800 disabled:opacity-50">{busy === 'save' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save draft</button>}
        {publication.status === 'draft' && <button type="button" onClick={() => run('approve', () => approveStudioPublication(album.id), 'Publishing metadata approved. The release is ready to submit.')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'approve' ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Approve metadata</button>}
        {(publication.status === 'ready' || publication.status === 'failed') && <button type="button" onClick={() => setConfirmPublish(true)} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{busy === 'publish' ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} {publication.status === 'failed' ? 'Retry submit to YouTube' : 'Submit to YouTube'}</button>}
        {publication.external_url && <a href={publication.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white"><ExternalLink size={16} /> View release</a>}
      </div>
    </>}
    <ConfirmationModal open={confirmPublish} title="Submit this album to YouTube?" message={`Submit “${draft.title}” to YouTube with ${draft.visibility} visibility. The publishing workflow will begin immediately.`} confirmLabel="Submit to YouTube" busy={busy === 'publish'} onCancel={() => { if (!busy) setConfirmPublish(false); }} onConfirm={() => void confirmYouTubeSubmission()} />
  </section>;
};

export default StudioPublishingPanel;

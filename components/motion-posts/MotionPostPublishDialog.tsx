import React, { useMemo, useState } from 'react';
import { CalendarClock, Loader2, Send, X } from 'lucide-react';
import type { MotionPostJob } from '../../types';
import { queueMotionPostPublication } from '../../services/motionPostService';

interface Props {
  job: MotionPostJob;
  onClose: () => void;
  onQueued: () => void | Promise<void>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function localInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const MotionPostPublishDialog: React.FC<Props> = ({ job, onClose, onQueued, addToast }) => {
  const finished = job.latest_finish?.status === 'succeeded' && job.latest_finish.output_url ? job.latest_finish : null;
  const [version, setVersion] = useState<'original' | 'text'>(finished ? 'text' : 'original');
  const [caption, setCaption] = useState(job.caption || '');
  const [scheduledFor, setScheduledFor] = useState(() => localInput(new Date(Date.now() + 30 * 60_000)));
  const [submitting, setSubmitting] = useState(false);
  const scheduleDate = useMemo(() => new Date(scheduledFor), [scheduledFor]);
  const valid = caption.trim().length > 0 && Number.isFinite(scheduleDate.getTime()) && scheduleDate.getTime() >= Date.now() + 60_000;

  const submit = async () => {
    if (!valid) return;
    try {
      setSubmitting(true);
      await queueMotionPostPublication({
        job_id: job.id,
        finishing_job_id: version === 'text' ? finished?.id : null,
        caption,
        scheduled_for: scheduleDate.toISOString(),
        idempotency_key: crypto.randomUUID(),
      });
      addToast('Reel added to the Post Publisher queue.', 'success');
      await onQueued();
      onClose();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not queue the Reel.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Schedule Motion Post Reel">
    <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-fuchsia-600">Post Publisher</p><h2 className="mt-1 text-xl font-black text-slate-900">Schedule this Instagram Reel</h2><p className="mt-1 text-xs leading-5 text-slate-500">Trellis keeps it in the visible queue until the scheduled publisher sends it.</p></div><button type="button" onClick={onClose} aria-label="Close publishing dialog" className="rounded-xl border border-slate-200 p-2 text-slate-500"><X className="h-5 w-5" /></button></div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[140px_1fr]">
        <video controls playsInline preload="metadata" src={version === 'text' ? finished?.output_url || job.output_url || '' : job.output_url || ''} className="aspect-[9/16] w-full rounded-2xl bg-slate-950 object-cover" />
        <div className="space-y-4">
          {finished && <fieldset><legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">Video version</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setVersion('text')} className={`rounded-xl border px-3 py-2 text-xs font-black ${version === 'text' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>With text</button><button type="button" onClick={() => setVersion('original')} className={`rounded-xl border px-3 py-2 text-xs font-black ${version === 'original' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>Original</button></div></fieldset>}
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Publish date and time<div className="relative mt-1.5"><CalendarClock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="datetime-local" value={scheduledFor} min={localInput(new Date(Date.now() + 60_000))} onChange={event => setScheduledFor(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-bold" /></div></label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Instagram caption<textarea value={caption} onChange={event => setCaption(event.target.value)} rows={7} maxLength={2200} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed" /></label>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">The scheduled worker checks roughly every 10 minutes, so the Reel can publish shortly after the selected time. You can monitor or cancel it in Post Publisher.</div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={!valid || submitting} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-orange-500 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Add to queue</button></div>
    </div>
  </div>;
};

export default MotionPostPublishDialog;

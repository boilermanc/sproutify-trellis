import React, { useMemo, useState } from 'react';
import { Loader2, Type, WandSparkles, X } from 'lucide-react';
import type { Branch, MediaTextCue, MediaTextStyle, MotionPostJob } from '../../types';
import { queueMotionPostFinish } from '../../services/motionPostService';
import TimedTextTimeline from '../media/TimedTextTimeline';
import VideoResultPreview from '../media/VideoResultPreview';
import { MEDIA_FONT_FAMILIES, MEDIA_FONT_OPTIONS, mediaFontIdForFamily } from '../media/mediaFonts';

interface Props {
  job: MotionPostJob;
  branches: Branch[];
  onClose: () => void;
  onQueued: () => void | Promise<void>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

const MotionPostFinishingEditor: React.FC<Props> = ({ job, branches, onClose, onQueued, addToast }) => {
  const branch = branches.find(candidate => candidate.id === job.branch_id);
  const prior = job.latest_finish;
  const [cues, setCues] = useState<MediaTextCue[]>(prior?.text_cues || []);
  const [style, setStyle] = useState<MediaTextStyle>(prior?.style || {
    font_id: mediaFontIdForFamily(branch?.font_family),
    font_size: 0.07,
    font_weight: 800,
    color: '#ffffff',
    background_color: isHex(branch?.primary_color || '') ? branch!.primary_color : '#000000',
    background_opacity: 0.58,
    uppercase: false,
    shadow: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const canRender = cues.length > 0 && cues.every(cue => cue.text.trim() && cue.end_seconds > cue.start_seconds);
  const selectedFont = useMemo(() => MEDIA_FONT_OPTIONS.find(option => option.id === style.font_id), [style.font_id]);

  const submit = async () => {
    if (!canRender) return;
    try {
      setSubmitting(true);
      await queueMotionPostFinish({ job_id: job.id, text_cues: cues, style, idempotency_key: crypto.randomUUID() });
      addToast('Text version queued. The original Motion Post is unchanged.', 'success');
      await onQueued();
      onClose();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not queue the text version.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add text to Motion Post">
    <div className="mx-auto my-4 w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Motion Post finishing</p><h2 className="mt-1 text-xl font-black text-slate-900">Add flowing text to the Reel</h2><p className="mt-1 text-xs text-slate-500">Set when each message appears. This creates a new version and keeps the original safe.</p></div>
        <button type="button" onClick={onClose} aria-label="Close text editor" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-5">
          {job.output_url && <VideoResultPreview src={job.output_url} cues={cues} style={style} />}
          <TimedTextTimeline durationSeconds={Math.max(1, Number(job.duration_seconds || 1))} cues={cues} onChange={setCues} showPreview={false} />
        </div>

        <aside className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:sticky lg:top-4 lg:self-start">
          <div><div className="flex items-center gap-2 text-sm font-black text-slate-900"><Type className="h-4 w-4 text-violet-600" /> Brand typography</div><p className="mt-1 text-xs leading-5 text-slate-500">Trellis starts with the selected branch font. You can choose any of the installed Rekkrd-ready fonts.</p></div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Font
            <select value={style.font_id} onChange={event => setStyle(current => ({ ...current, font_id: event.target.value as MediaTextStyle['font_id'] }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800" style={{ fontFamily: MEDIA_FONT_FAMILIES[style.font_id] }}>
              {MEDIA_FONT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <span className="mt-1 block text-[11px] font-medium normal-case text-slate-400">Previewing {selectedFont?.label || 'selected font'}.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Weight<select value={style.font_weight} onChange={event => setStyle(current => ({ ...current, font_weight: Number(event.target.value) as MediaTextStyle['font_weight'] }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold">{[400, 600, 700, 800, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}</select></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Size<input type="range" min={0.035} max={0.14} step={0.005} value={style.font_size} onChange={event => setStyle(current => ({ ...current, font_size: Number(event.target.value) }))} className="mt-4 w-full accent-violet-600" /><span className="block text-center text-[11px] font-bold text-slate-400">{Math.round(style.font_size * 1000) / 10}%</span></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Text color<input type="color" value={style.color} onChange={event => setStyle(current => ({ ...current, color: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white p-1" /></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Text background<input type="color" value={style.background_color} onChange={event => setStyle(current => ({ ...current, background_color: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white p-1" /></label>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Background strength<input type="range" min={0} max={0.9} step={0.05} value={style.background_opacity} onChange={event => setStyle(current => ({ ...current, background_opacity: Number(event.target.value) }))} className="mt-2 w-full accent-violet-600" /></label>
          <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600"><label className="flex items-center gap-2"><input type="checkbox" checked={style.uppercase} onChange={event => setStyle(current => ({ ...current, uppercase: event.target.checked }))} className="accent-violet-600" /> Uppercase</label><label className="flex items-center gap-2"><input type="checkbox" checked={style.shadow} onChange={event => setStyle(current => ({ ...current, shadow: event.target.checked }))} className="accent-violet-600" /> Text shadow</label></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800"><strong>No xAI charge:</strong> Trellis is rendering text over the video you already created.</div>
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="button" disabled={!canRender || submitting} onClick={() => void submit()} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Render text version</button></div>
        </aside>
      </div>
    </div>
  </div>;
};

export default MotionPostFinishingEditor;

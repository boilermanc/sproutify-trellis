import React, { useMemo, useState } from 'react';
import { AlignCenter, Captions, Plus, Trash2 } from 'lucide-react';
import type { MediaTextAnimation, MediaTextCue, MediaTextPosition } from '../../types';

interface Props {
  durationSeconds: number;
  cues: MediaTextCue[];
  onChange: (cues: MediaTextCue[]) => void;
}

const positions: Array<{ value: MediaTextPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const animations: Array<{ value: MediaTextAnimation; label: string }> = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide_up', label: 'Slide up' },
  { value: 'word_reveal', label: 'Word reveal' },
];

let cueCounter = 0;
function cueId(): string {
  cueCounter += 1;
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cue-${Date.now().toString(36)}-${cueCounter}`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const timeLabel = (value: number) => `${value.toFixed(1)}s`;

const TimedTextTimeline: React.FC<Props> = ({ durationSeconds, cues, onChange }) => {
  const [previewTime, setPreviewTime] = useState(0);
  const safeDuration = Math.max(1, durationSeconds);
  const activeCue = useMemo(
    () => cues.find(cue => previewTime >= cue.start_seconds && previewTime <= cue.end_seconds) || null,
    [cues, previewTime],
  );

  const updateCue = (id: string, patch: Partial<MediaTextCue>) => {
    onChange(cues.map(cue => {
      if (cue.id !== id) return cue;
      const next = { ...cue, ...patch };
      next.start_seconds = clamp(next.start_seconds, 0, Math.max(0, safeDuration - 0.2));
      next.end_seconds = clamp(next.end_seconds, next.start_seconds + 0.2, safeDuration);
      return next;
    }).sort((a, b) => a.start_seconds - b.start_seconds));
  };

  const addCue = () => {
    const lastEnd = cues.reduce((latest, cue) => Math.max(latest, cue.end_seconds), 0);
    const start = lastEnd >= safeDuration - 0.2 ? 0 : lastEnd;
    const end = Math.min(safeDuration, start + Math.min(3, safeDuration));
    onChange([...cues, {
      id: cueId(),
      text: 'Add your message',
      start_seconds: Number(start.toFixed(1)),
      end_seconds: Number(end.toFixed(1)),
      position: 'center',
      animation: 'fade',
    }]);
    setPreviewTime(start);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Captions className="h-4 w-4 text-violet-600" /> Flowing text</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Plan editable text that appears throughout the finished video. It stays separate from the AI-generated picture.</p>
        </div>
        <button type="button" onClick={addCue} className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"><Plus className="h-3.5 w-3.5" /> Add text</button>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-800 to-violet-950 shadow-inner">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_30%,rgba(255,255,255,.35),transparent_30%)]" />
        <div className={`absolute inset-x-6 flex ${activeCue?.position === 'top' ? 'top-8 items-start' : activeCue?.position === 'bottom' ? 'bottom-8 items-end' : 'inset-y-0 items-center'} justify-center text-center`}>
          {activeCue ? <p className="max-w-[85%] text-balance text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-3xl">{activeCue.text}</p> : <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/35">Move the playhead to preview text</p>}
        </div>
        <div className="absolute bottom-2 right-3 rounded-md bg-black/40 px-2 py-1 text-[10px] font-bold text-white/80">{timeLabel(previewTime)} / {timeLabel(safeDuration)}</div>
      </div>

      <div>
        <input aria-label="Text preview time" type="range" min={0} max={safeDuration} step={0.1} value={Math.min(previewTime, safeDuration)} onChange={event => setPreviewTime(Number(event.target.value))} className="w-full accent-violet-600" />
        <div className="relative mt-2 h-9 overflow-hidden rounded-lg bg-slate-100">
          {cues.map((cue, index) => <button key={cue.id} type="button" onClick={() => setPreviewTime(cue.start_seconds)} title={`${cue.text} · ${timeLabel(cue.start_seconds)}–${timeLabel(cue.end_seconds)}`} className="absolute inset-y-1 overflow-hidden rounded-md border border-violet-300 bg-violet-200 px-2 text-left text-[9px] font-black text-violet-800" style={{ left: `${(cue.start_seconds / safeDuration) * 100}%`, width: `${Math.max(2, ((cue.end_seconds - cue.start_seconds) / safeDuration) * 100)}%`, zIndex: index + 1 }}><span className="block truncate">{cue.text}</span></button>)}
        </div>
      </div>

      {cues.length === 0 ? (
        <button type="button" onClick={addCue} className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-7 text-xs font-bold text-slate-500 hover:border-violet-300 hover:text-violet-700"><AlignCenter className="h-5 w-5" /> Add the first timed message</button>
      ) : (
        <div className="space-y-3">
          {cues.map((cue, index) => <div key={cue.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700">{index + 1}</span>
              <input aria-label={`Text cue ${index + 1}`} value={cue.text} onFocus={() => setPreviewTime(cue.start_seconds)} onChange={event => updateCue(cue.id, { text: event.target.value.slice(0, 180) })} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400" />
              <button type="button" aria-label={`Delete text cue ${index + 1}`} onClick={() => onChange(cues.filter(item => item.id !== cue.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Start<input type="number" min={0} max={safeDuration} step={0.1} value={cue.start_seconds} onChange={event => updateCue(cue.id, { start_seconds: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700" /></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">End<input type="number" min={0.2} max={safeDuration} step={0.1} value={cue.end_seconds} onChange={event => updateCue(cue.id, { end_seconds: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700" /></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Position<select value={cue.position} onChange={event => updateCue(cue.id, { position: event.target.value as MediaTextPosition })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700">{positions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Motion<select value={cue.animation} onChange={event => updateCue(cue.id, { animation: event.target.value as MediaTextAnimation })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700">{animations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
          </div>)}
        </div>
      )}
    </div>
  );
};

export default TimedTextTimeline;

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Film, Loader2 } from 'lucide-react';
import { exportVideoEdit, mp4RecordingType, validateVideoEdit } from '../services/localVideoEdit';

interface Props { branchName: string; onBack: () => void; addToast: (message: string, type?: 'success' | 'error' | 'info') => void }
const field = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
export default function ClipVideoEditor({ branchName, onBack, addToast }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [headline, setHeadline] = useState('');
  const [audio, setAudio] = useState(true);
  const [caption, setCaption] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<AbortController | null>(null);
  const previewing = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output); }, [output]);
  useEffect(() => { setOutput(''); }, [start, end, headline, audio, source]);
  const edit = { start, end, headline, audio };
  const invalid = validateVideoEdit(edit, duration);
  const supported = !!mp4RecordingType();
  function importFile(next?: File) {
    if (!next) return;
    if (!/\.(mp4|m4v|mov|webm)$/i.test(next.name) || next.size === 0 || next.size > 250 * 1024 * 1024) { setError('Choose a nonempty MP4, M4V, MOV or WebM file under 250 MB.'); return; }
    video.current?.pause(); previewing.current = false;
    setError(''); setDuration(0); setStart(0); setEnd(0); setFile(next); setSource(URL.createObjectURL(next));
  }
  async function exportClip() {
    if (invalid || busy) return;
    video.current?.pause(); setBusy(true); setError(''); setOutput(''); setProgress(0);
    const task = new AbortController(); controller.current = task;
    try {
      const blob = await exportVideoEdit(source, edit, task.signal, setProgress);
      if (!task.signal.aborted) { setOutput(URL.createObjectURL(blob)); addToast('Video exported. Review it before uploading to TikTok.', 'success'); }
    } catch (e) {
      if (!task.signal.aborted) { const message = e instanceof Error ? e.message : 'Export failed'; setError(message); addToast(message, 'error'); }
    } finally { if (controller.current === task) { controller.current = null; setBusy(false); } }
  }
  return <section className="max-w-5xl mx-auto space-y-5 pb-16">
    <button type="button" disabled={busy} onClick={onBack} className="flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> Clip library</button>
    <h2 className="text-2xl font-black text-slate-800 flex gap-2 items-center"><Film/> Edit a video</h2>
    <p className="text-sm text-slate-600">{branchName} · Trim existing footage and download a video for manual upload. Your original file stays unchanged.</p>
    <p className="text-sm text-slate-500">This edit stays in this tab and is not saved to the cloud library. Download your video and caption before leaving.</p>
    <label className="block font-bold text-sm">Import video
      <input aria-label="Import video" type="file" accept=".mp4,.m4v,.mov,.webm,video/mp4,video/quicktime,video/webm" disabled={busy} onChange={e => { importFile(e.target.files?.[0]); e.target.value = ''; }} className="block mt-2"/>
    </label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {source && <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-2">
        <div className="relative bg-black rounded-2xl overflow-hidden">
          <video ref={video} src={source} controls playsInline preload="auto" muted={!audio} className="w-full max-h-[560px]" onLoadedMetadata={e => { const d = e.currentTarget.duration; if (!Number.isFinite(d) || d <= 0) { setError('This video has no readable duration. Try an H.264 MP4.'); return; } setDuration(d); setEnd(Math.min(d, 180)); }} onError={() => { setDuration(0); setError('This browser cannot play the selected video. Try an H.264 MP4.'); }} onTimeUpdate={e => { if (previewing.current && e.currentTarget.currentTime >= end) { e.currentTarget.pause(); previewing.current = false; } }}/>
        </div>
        <p className="text-xs text-slate-500">{file?.name} · {duration.toFixed(2)} seconds. Original framing is preserved. The headline is burned into the exported video; review it below after export.</p>
      </div>
      <div className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <legend className="font-bold mb-2">Trim and text</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Start (seconds)<input className={field} type="number" min={0} max={duration} step="0.1" value={start} onChange={e => setStart(e.target.valueAsNumber)}/></label>
            <label className="text-sm">End (seconds)<input className={field} type="number" min={0} max={duration} step="0.1" value={end} onChange={e => setEnd(e.target.valueAsNumber)}/></label>
          </div>
          {invalid && <p className="text-sm text-rose-700">{invalid}</p>}
          <button type="button" disabled={!!invalid} className="text-emerald-700 font-bold text-sm" onClick={() => { const el = video.current; if (el) { el.currentTime = start; previewing.current = true; el.play().catch(() => setError('Press play on the video to preview.')); } }}>Preview selected range</button>
          <label className="block text-sm">On-screen headline (optional)<input className={field} maxLength={65} value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Growing food in a tower at home?"/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={audio} onChange={e => setAudio(e.target.checked)}/> Keep original audio</label>
          <label className="block text-sm">Post caption<textarea className={field} rows={5} value={caption} onChange={e => setCaption(e.target.value)}/></label>
        </fieldset>
        {!supported && <p role="alert" className="text-amber-800">This browser cannot export MP4. Open this editor in a current Chrome or Edge browser.</p>}
        <button type="button" disabled={busy || !!invalid || !supported} onClick={exportClip} className="rounded-xl px-5 py-3 bg-emerald-600 text-white font-bold disabled:opacity-50 flex items-center gap-2">{busy ? <Loader2 className="animate-spin" size={18}/> : <Download size={18}/>} {busy ? `Exporting ${Math.round(progress * 100)}%` : 'Export MP4'}</button>
        {busy && <><p role="status" className="text-sm">Keep this tab visible. Export takes about the length of your selected clip.</p><button type="button" onClick={() => controller.current?.abort()} className="text-sm underline">Cancel export</button></>}
        {caption && <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([caption], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'tiktok-caption.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }} className="text-sm underline">Download caption</button>}
      </div>
    </div>}
    {output && <div className="rounded-2xl border border-emerald-200 p-4 space-y-3"><h3 className="font-bold">Review exported video</h3><video src={output} controls playsInline className="max-h-[560px] max-w-full"/><a href={output} download={`${file?.name.replace(/\.[^.]+$/, '') || 'clip'}-edited.mp4`} className="inline-block bg-emerald-600 text-white rounded-xl px-4 py-2 font-bold">Download MP4</a><p className="text-sm text-slate-500">Nothing has been posted or scheduled. Review audio, text and framing, then upload manually to the intended TikTok account.</p></div>}
  </section>;
}

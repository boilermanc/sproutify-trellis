import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Save, Type } from 'lucide-react';
import { StudioCoverConcept } from '../types';
import { saveStudioVideoArtworkComposite } from '../services/studioAlbumsService';

interface Props {
  albumId: string;
  source: StudioCoverConcept;
  defaultTitle: string;
  defaultSubtitle?: string;
  defaultSeries?: string;
  onSaved: (concept: StudioCoverConcept) => void;
}

const W = 1280;
const H = 720;
type Treatment = 'riviera_editorial' | 'travel_poster' | 'after_dark';
const TREATMENTS: Array<{ id: Treatment; label: string }> = [
  { id: 'riviera_editorial', label: 'Riviera Editorial' },
  { id: 'travel_poster', label: 'Travel Poster' },
  { id: 'after_dark', label: 'After Dark' },
];

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export const StudioVideoArtworkComposer: React.FC<Props> = ({ albumId, source, defaultTitle, defaultSubtitle = '', defaultSeries = 'Rekkrd After Dark', onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [series, setSeries] = useState(defaultSeries || 'Rekkrd After Dark');
  const [treatment, setTreatment] = useState<Treatment>('riviera_editorial');
  const [vintageBorder, setVintageBorder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;
    ctx.clearRect(0, 0, W, H);
    const scale = Math.max(W / image.width, H / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);

    if (vintageBorder) {
      ctx.strokeStyle = '#f1e3c3';
      ctx.lineWidth = 18;
      ctx.strokeRect(9, 9, W - 18, H - 18);
      ctx.strokeStyle = 'rgba(57,70,73,.48)';
      ctx.lineWidth = 2;
      ctx.strokeRect(21, 21, W - 42, H - 42);
    }

    ctx.textBaseline = 'alphabetic';
    if (treatment === 'riviera_editorial') {
      const wash = ctx.createLinearGradient(W * .45, 0, W, 0);
      wash.addColorStop(0, 'rgba(247,235,207,0)');
      wash.addColorStop(1, 'rgba(247,235,207,.9)');
      ctx.fillStyle = wash;
      ctx.fillRect(W * .4, 0, W * .6, H * .58);
      ctx.fillStyle = '#87351f';
      ctx.textAlign = 'right';
      ctx.font = '700 62px "Cormorant Garamond", Georgia, serif';
      const lines = wrapText(ctx, title, 560, 3);
      lines.forEach((line, index) => ctx.fillText(line, W - 58, 90 + index * 58));
      if (subtitle.trim()) {
        ctx.fillStyle = '#5c493a';
        ctx.font = 'italic 25px "Cormorant Garamond", Georgia, serif';
        ctx.fillText(subtitle, W - 58, 120 + lines.length * 58);
      }
    } else if (treatment === 'travel_poster') {
      const wash = ctx.createLinearGradient(0, 0, W * .58, 0);
      wash.addColorStop(0, 'rgba(248,226,169,.94)');
      wash.addColorStop(1, 'rgba(248,226,169,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W * .62, H * .62);
      ctx.fillStyle = '#d64b1d';
      ctx.textAlign = 'left';
      ctx.font = '400 76px "Bebas Neue", Impact, sans-serif';
      const lines = wrapText(ctx, title.toUpperCase(), 690, 3);
      lines.forEach((line, index) => ctx.fillText(line, 52, 94 + index * 70));
      if (subtitle.trim()) {
        ctx.fillStyle = '#263756';
        ctx.font = '700 24px Inter, Arial, sans-serif';
        ctx.fillText(subtitle.toUpperCase(), 56, 126 + lines.length * 70);
      }
    } else {
      const shade = ctx.createLinearGradient(0, H * .38, 0, H);
      shade.addColorStop(0, 'rgba(6,14,25,0)');
      shade.addColorStop(1, 'rgba(6,14,25,.9)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, H * .36, W, H * .64);
      ctx.fillStyle = '#f5d58b';
      ctx.textAlign = 'left';
      ctx.font = '400 64px "Abril Fatface", Georgia, serif';
      wrapText(ctx, title, 1000, 2).forEach((line, index) => ctx.fillText(line, 58, H - 130 + index * 62));
      if (subtitle.trim()) {
        ctx.fillStyle = '#fff';
        ctx.font = 'italic 25px "Cormorant Garamond", Georgia, serif';
        ctx.fillText(subtitle, 60, H - 214);
      }
    }

    ctx.fillStyle = '#fff4d6';
    ctx.textAlign = 'center';
    ctx.font = '700 18px Inter, Arial, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 8;
    ctx.fillText((series.trim() || 'Rekkrd After Dark').toUpperCase(), W / 2, H - 28);
    ctx.shadowBlur = 0;
  }, [series, subtitle, title, treatment, vintageBorder]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        await document.fonts.ready;
        const response = await fetch(source.image_url || '', { mode: 'cors' });
        if (!response.ok) throw new Error('Could not load the 16:9 video artwork.');
        const bitmap = await createImageBitmap(await response.blob());
        if (!cancelled) { imageRef.current?.close(); imageRef.current = bitmap; draw(); }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the 16:9 video artwork.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.image_url]);
  useEffect(() => { draw(); }, [draw]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const concept = await saveStudioVideoArtworkComposite(albumId, source.id, canvas.toDataURL('image/png'), { title, subtitle, series: series.trim() || 'Rekkrd After Dark', treatment, vintage_border: vintageBorder });
      setSaved(true); onSaved(concept); window.setTimeout(() => setSaved(false), 3500);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the finished video artwork.'); }
    finally { setSaving(false); }
  };

  return <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
    <div className="flex items-start gap-3"><Type className="mt-0.5 text-sky-700" size={18} /><div><p className="text-xs font-black uppercase tracking-widest text-sky-800">Finish the 16:9 YouTube artwork</p><p className="mt-1 text-xs text-sky-900">This is a separate widescreen composition—not the square cover floating inside the video.</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <canvas ref={canvasRef} width={W} height={H} className="aspect-video w-full rounded-xl border border-sky-200 bg-slate-900" />
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">Typography style<select value={treatment} onChange={event => setTreatment(event.target.value as Treatment)} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm">{TREATMENTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="block text-xs font-bold text-slate-700">Album title<textarea value={title} onChange={event => setTitle(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-bold text-slate-700">Release subtitle<input value={subtitle} onChange={event => setSubtitle(event.target.value)} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-bold text-slate-700">Bottom imprint<input value={series} onChange={event => setSeries(event.target.value)} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={vintageBorder} onChange={event => setVintageBorder(event.target.checked)} className="h-4 w-4 accent-sky-700" /> Vintage postcard border</label>
        <button type="button" onClick={save} disabled={saving || !source.image_url || !title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? 'Video artwork saved' : 'Save video artwork'}</button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  </div>;
};

export default StudioVideoArtworkComposer;

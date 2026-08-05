import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Save, Type } from 'lucide-react';
import { StudioCoverConcept } from '../types';
import { saveStudioCoverComposite } from '../services/studioAlbumsService';

interface Props {
  albumId: string;
  source: StudioCoverConcept;
  defaultTitle: string;
  defaultSubtitle?: string;
  defaultSeries?: string;
  defaultTitleColor?: string;
  onSaved: (concept: StudioCoverConcept) => void;
}

const W = 1024;
const H = 1024;
// The video render crops the square cover to the center 9:16 of 16:9's inverse
// (720/1280 of the scaled height), so the top and bottom (1 - 9/16)/2 ≈ 21.875%
// of this canvas gets cut off in the final YouTube video. Shown as a guide below.
const VIDEO_CROP_FRACTION = (1 - 9 / 16) / 2;

const TREATMENTS = [
  { id: 'riviera_editorial', label: 'Riviera Editorial' },
  { id: 'travel_poster', label: 'Travel Poster' },
  { id: 'after_dark', label: 'After Dark' },
] as const;
type Treatment = typeof TREATMENTS[number]['id'];
const TREATMENT_DEFAULT_COLOR: Record<Treatment, string> = {
  riviera_editorial: '#87351f',
  travel_poster: '#d64b1d',
  after_dark: '#f5d58b',
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawLetterspaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: CanvasTextAlign = 'left') {
  const chars = [...text];
  const widths = chars.map(char => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * spacing;
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + spacing;
  });
}

export const StudioCoverComposer: React.FC<Props> = ({ albumId, source, defaultTitle, defaultSubtitle = '', defaultSeries = 'Rekkrd After Dark', defaultTitleColor, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [series, setSeries] = useState(defaultSeries || 'Rekkrd After Dark');
  const [treatment, setTreatment] = useState<Treatment>('riviera_editorial');
  const [titleColor, setTitleColor] = useState(defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
  const [vintageBorder, setVintageBorder] = useState(true);
  const [showCropGuide, setShowCropGuide] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setSeries(defaultSeries || 'Rekkrd After Dark');
    setTitleColor(defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
  }, [defaultSeries, defaultSubtitle, defaultTitle, defaultTitleColor, source.id]);

  const changeTreatment = (next: Treatment) => { setTreatment(next); setTitleColor(TREATMENT_DEFAULT_COLOR[next]); };

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
      ctx.save();
      ctx.strokeStyle = '#f2e5c6';
      ctx.lineWidth = 26;
      ctx.strokeRect(13, 13, W - 26, H - 26);
      ctx.strokeStyle = 'rgba(65,82,86,0.48)';
      ctx.lineWidth = 2;
      ctx.strokeRect(28, 28, W - 56, H - 56);
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 3;
      [[44, 28, 118, 28], [770, 28, 944, 28], [28, 110, 28, 220], [996, 690, 996, 932], [76, 996, 260, 996], [720, 996, 910, 996]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    if (treatment === 'riviera_editorial') {
      const wash = ctx.createLinearGradient(W * 0.38, 0, W, 0);
      wash.addColorStop(0, 'rgba(247,235,207,0)');
      wash.addColorStop(1, 'rgba(247,235,207,0.88)');
      ctx.fillStyle = wash;
      ctx.fillRect(W * 0.34, 0, W * 0.66, H * 0.47);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'right';
      let size = 72;
      let lines: string[] = [];
      do {
        ctx.font = `700 ${size}px "Cormorant Garamond", Georgia, serif`;
        lines = wrapText(ctx, title, 500, 3);
        size -= lines.length > 3 || lines.some(line => ctx.measureText(line).width > 500) ? 4 : 0;
      } while (size > 44 && lines.some(line => ctx.measureText(line).width > 500));
      lines.forEach((line, index) => ctx.fillText(line, 952, 105 + index * size * 0.92));
      if (subtitle.trim()) {
        ctx.font = 'italic 30px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = titleColor;
        ctx.fillText(subtitle, 952, 135 + lines.length * size * 0.92);
      }
    } else if (treatment === 'travel_poster') {
      const wash = ctx.createLinearGradient(0, 0, W * 0.72, 0);
      wash.addColorStop(0, 'rgba(248,226,169,0.94)');
      wash.addColorStop(1, 'rgba(248,226,169,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W * 0.76, H * 0.52);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'left';
      let size = 94;
      let lines: string[] = [];
      while (size >= 54) {
        ctx.font = `400 ${size}px "Bebas Neue", Impact, sans-serif`;
        lines = wrapText(ctx, title.toUpperCase(), 650, 3);
        if (lines.every(line => ctx.measureText(line).width <= 650)) break;
        size -= 4;
      }
      lines.forEach((line, index) => ctx.fillText(line, 66, 112 + index * size * 0.91));
      if (subtitle.trim()) {
        ctx.font = '700 30px Inter, Arial, sans-serif';
        ctx.fillStyle = titleColor;
        ctx.fillText(subtitle.toUpperCase(), 70, 145 + lines.length * size * 0.91);
      }
    } else {
      const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
      shade.addColorStop(0, 'rgba(6,14,25,0)');
      shade.addColorStop(1, 'rgba(6,14,25,0.88)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, H * 0.42, W, H * 0.58);
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'left';
      ctx.font = '400 82px "Abril Fatface", Georgia, serif';
      const lines = wrapText(ctx, title, 830, 3);
      lines.forEach((line, index) => ctx.fillText(line, 70, 700 + index * 84));
      if (subtitle.trim()) {
        ctx.font = 'italic 31px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = titleColor;
        ctx.fillText(subtitle, 74, 700 - 54);
      }
    }

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.font = '700 24px Inter, Arial, sans-serif';
    ctx.fillStyle = '#fff4d6';
    drawLetterspaced(ctx, (series.trim() || 'Rekkrd After Dark').toUpperCase(), W / 2, H - 36, 5, 'center');
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [series, subtitle, title, titleColor, treatment, vintageBorder]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        await document.fonts.ready;
        const response = await fetch(source.image_url || '', { mode: 'cors' });
        if (!response.ok) throw new Error('Could not load the selected cover image.');
        const bitmap = await createImageBitmap(await response.blob());
        if (!cancelled) {
          imageRef.current?.close();
          imageRef.current = bitmap;
          draw();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the selected cover image.');
      }
    })();
    return () => { cancelled = true; };
    // `draw` intentionally stays out of this dependency list: editing type should
    // redraw the existing bitmap, not download the source image again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.image_url]);

  useEffect(() => { draw(); }, [draw]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const concept = await saveStudioCoverComposite(albumId, source.id, canvas.toDataURL('image/png'), { title, subtitle, series: series.trim() || 'Rekkrd After Dark', treatment, vintage_border: vintageBorder, title_color: titleColor });
      setSaved(true);
      onSaved(concept);
      window.setTimeout(() => setSaved(false), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the titled cover.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <div className="flex items-start gap-3"><Type className="mt-0.5 text-amber-700" size={18} /><div><p className="text-xs font-black uppercase tracking-widest text-amber-800">Finish the cover typography</p><p className="mt-1 text-xs text-amber-900">The photograph stays clean; Trellis adds real, correctly spelled type. Save this version before approving the cover.</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="aspect-square w-full rounded-xl border border-amber-200 bg-slate-900" />
        {showCropGuide && <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 top-0 flex items-start justify-center bg-black/55 pt-1" style={{ height: `${VIDEO_CROP_FRACTION * 100}%` }}><span className="text-[9px] font-black uppercase tracking-widest text-white/85">Cropped in the 16:9 video</span></div>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-black/55 pb-1" style={{ height: `${VIDEO_CROP_FRACTION * 100}%` }}><span className="text-[9px] font-black uppercase tracking-widest text-white/85">Cropped in the 16:9 video</span></div>
        </div>}
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">Typography style<select value={treatment} onChange={event => changeTreatment(event.target.value as Treatment)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm">{TREATMENTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="block text-xs font-bold text-slate-700">Text color<input type="color" value={titleColor} onChange={event => setTitleColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-amber-200 bg-white p-1" /></label>
        <label className="block text-xs font-bold text-slate-700">Album title<textarea value={title} onChange={event => setTitle(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-bold text-slate-700">Release subtitle<input value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-bold text-slate-700">Bottom imprint<input value={series} onChange={event => setSeries(event.target.value)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={vintageBorder} onChange={event => setVintageBorder(event.target.checked)} className="h-4 w-4 accent-amber-700" /> Vintage postcard border</label>
        <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={showCropGuide} onChange={event => setShowCropGuide(event.target.checked)} className="h-4 w-4 accent-amber-700" /> Show 16:9 video crop guide</label>
        <button type="button" onClick={save} disabled={saving || !source.image_url || !title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? 'Titled cover saved' : 'Save titled cover'}</button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  </div>;
};

export default StudioCoverComposer;

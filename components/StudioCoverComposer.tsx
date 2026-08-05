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
  defaultTitleFont?: string;
  defaultSubtitleColor?: string;
  defaultSubtitleFont?: string;
  defaultSeriesColor?: string;
  defaultSeriesFont?: string;
  onSaved: (concept: StudioCoverConcept) => void;
}

const W = 1024;
const H = 1024;

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

const FONT_OPTIONS = [
  { id: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif' },
  { id: 'abril', label: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  { id: 'oswald', label: 'Oswald', family: '"Oswald", Impact, sans-serif' },
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat", Arial, sans-serif' },
  { id: 'inter', label: 'Inter', family: '"Inter", Arial, sans-serif' },
  { id: 'jetbrains', label: 'JetBrains Mono', family: '"JetBrains Mono", "Courier New", monospace' },
] as const;
type FontId = typeof FONT_OPTIONS[number]['id'];
const FONT_FAMILY: Record<FontId, string> = Object.fromEntries(FONT_OPTIONS.map(item => [item.id, item.family])) as Record<FontId, string>;
const TREATMENT_DEFAULT_FONT: Record<Treatment, FontId> = {
  riviera_editorial: 'cormorant',
  travel_poster: 'bebas',
  after_dark: 'abril',
};
const isFontId = (value: unknown): value is FontId => FONT_OPTIONS.some(item => item.id === value);

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

const DEFAULT_SERIES_COLOR = '#fff4d6';
const DEFAULT_SERIES_FONT: FontId = 'inter';

export const StudioCoverComposer: React.FC<Props> = ({ albumId, source, defaultTitle, defaultSubtitle = '', defaultSeries = 'Rekkrd After Dark', defaultTitleColor, defaultTitleFont, defaultSubtitleColor, defaultSubtitleFont, defaultSeriesColor, defaultSeriesFont, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [series, setSeries] = useState(defaultSeries || 'Rekkrd After Dark');
  const [treatment, setTreatment] = useState<Treatment>('riviera_editorial');
  const [titleColor, setTitleColor] = useState(defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
  const [titleFont, setTitleFont] = useState<FontId>(isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT.riviera_editorial);
  const [subtitleColor, setSubtitleColor] = useState(defaultSubtitleColor || defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
  const [subtitleFont, setSubtitleFont] = useState<FontId>(isFontId(defaultSubtitleFont) ? defaultSubtitleFont : (isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT.riviera_editorial));
  const [seriesColor, setSeriesColor] = useState(defaultSeriesColor || DEFAULT_SERIES_COLOR);
  const [seriesFont, setSeriesFont] = useState<FontId>(isFontId(defaultSeriesFont) ? defaultSeriesFont : DEFAULT_SERIES_FONT);
  const [vintageBorder, setVintageBorder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setSeries(defaultSeries || 'Rekkrd After Dark');
    setTitleColor(defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
    setTitleFont(isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT.riviera_editorial);
    setSubtitleColor(defaultSubtitleColor || defaultTitleColor || TREATMENT_DEFAULT_COLOR.riviera_editorial);
    setSubtitleFont(isFontId(defaultSubtitleFont) ? defaultSubtitleFont : (isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT.riviera_editorial));
    setSeriesColor(defaultSeriesColor || DEFAULT_SERIES_COLOR);
    setSeriesFont(isFontId(defaultSeriesFont) ? defaultSeriesFont : DEFAULT_SERIES_FONT);
  }, [defaultSeries, defaultSubtitle, defaultTitle, defaultTitleColor, defaultTitleFont, defaultSubtitleColor, defaultSubtitleFont, defaultSeriesColor, defaultSeriesFont, source.id]);

  const changeTreatment = (next: Treatment) => {
    setTreatment(next);
    setTitleColor(TREATMENT_DEFAULT_COLOR[next]);
    setTitleFont(TREATMENT_DEFAULT_FONT[next]);
    setSubtitleColor(TREATMENT_DEFAULT_COLOR[next]);
    setSubtitleFont(TREATMENT_DEFAULT_FONT[next]);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;
    const fontFamily = FONT_FAMILY[titleFont];
    const subtitleFontFamily = FONT_FAMILY[subtitleFont];
    const seriesFontFamily = FONT_FAMILY[seriesFont];

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
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'right';
      let size = 72;
      let lines: string[] = [];
      do {
        ctx.font = `700 ${size}px ${fontFamily}`;
        lines = wrapText(ctx, title, 500, 3);
        size -= lines.length > 3 || lines.some(line => ctx.measureText(line).width > 500) ? 4 : 0;
      } while (size > 44 && lines.some(line => ctx.measureText(line).width > 500));
      lines.forEach((line, index) => ctx.fillText(line, 952, 105 + index * size * 0.92));
      if (subtitle.trim()) {
        ctx.font = `italic 30px ${subtitleFontFamily}`;
        ctx.fillStyle = subtitleColor;
        ctx.fillText(subtitle, 952, 135 + lines.length * size * 0.92);
      }
    } else if (treatment === 'travel_poster') {
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'left';
      let size = 94;
      let lines: string[] = [];
      while (size >= 54) {
        ctx.font = `700 ${size}px ${fontFamily}`;
        lines = wrapText(ctx, title.toUpperCase(), 650, 3);
        if (lines.every(line => ctx.measureText(line).width <= 650)) break;
        size -= 4;
      }
      lines.forEach((line, index) => ctx.fillText(line, 66, 112 + index * size * 0.91));
      if (subtitle.trim()) {
        ctx.font = `700 30px ${subtitleFontFamily}`;
        ctx.fillStyle = subtitleColor;
        ctx.fillText(subtitle.toUpperCase(), 70, 145 + lines.length * size * 0.91);
      }
    } else {
      ctx.fillStyle = titleColor;
      ctx.textAlign = 'left';
      ctx.font = `700 82px ${fontFamily}`;
      const lines = wrapText(ctx, title, 830, 3);
      lines.forEach((line, index) => ctx.fillText(line, 70, 700 + index * 84));
      if (subtitle.trim()) {
        ctx.font = `italic 31px ${subtitleFontFamily}`;
        ctx.fillStyle = subtitleColor;
        ctx.fillText(subtitle, 74, 700 - 54);
      }
    }

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.font = `700 24px ${seriesFontFamily}`;
    ctx.fillStyle = seriesColor;
    drawLetterspaced(ctx, (series.trim() || 'Rekkrd After Dark').toUpperCase(), W / 2, H - 36, 5, 'center');
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [series, seriesColor, seriesFont, subtitle, subtitleColor, subtitleFont, title, titleColor, titleFont, treatment, vintageBorder]);

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
      const concept = await saveStudioCoverComposite(albumId, source.id, canvas.toDataURL('image/png'), { title, subtitle, series: series.trim() || 'Rekkrd After Dark', treatment, vintage_border: vintageBorder, title_color: titleColor, title_font: titleFont, subtitle_color: subtitleColor, subtitle_font: subtitleFont, series_color: seriesColor, series_font: seriesFont });
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
      <canvas ref={canvasRef} width={W} height={H} className="aspect-square w-full rounded-xl border border-amber-200 bg-slate-900" />
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">Typography style<select value={treatment} onChange={event => changeTreatment(event.target.value as Treatment)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm">{TREATMENTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>

        <div className="rounded-xl border border-amber-200 bg-white/60 p-3 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Album title</p>
          <textarea value={title} onChange={event => setTitle(event.target.value)} className="w-full min-h-20 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block text-xs font-bold text-slate-700">Font<select value={titleFont} onChange={event => setTitleFont(event.target.value as FontId)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm">{FONT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700">Color<input type="color" value={titleColor} onChange={event => setTitleColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-amber-200 bg-white p-1" /></label>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white/60 p-3 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Release subtitle</p>
          <input value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder="Optional" className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block text-xs font-bold text-slate-700">Font<select value={subtitleFont} onChange={event => setSubtitleFont(event.target.value as FontId)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm">{FONT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700">Color<input type="color" value={subtitleColor} onChange={event => setSubtitleColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-amber-200 bg-white p-1" /></label>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white/60 p-3 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Bottom imprint</p>
          <input value={series} onChange={event => setSeries(event.target.value)} className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm" />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block text-xs font-bold text-slate-700">Font<select value={seriesFont} onChange={event => setSeriesFont(event.target.value as FontId)} className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm">{FONT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700">Color<input type="color" value={seriesColor} onChange={event => setSeriesColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-amber-200 bg-white p-1" /></label>
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={vintageBorder} onChange={event => setVintageBorder(event.target.checked)} className="h-4 w-4 accent-amber-700" /> Vintage postcard border</label>
        <button type="button" onClick={save} disabled={saving || !source.image_url || !title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? 'Titled cover saved' : 'Save titled cover'}</button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  </div>;
};

export default StudioCoverComposer;

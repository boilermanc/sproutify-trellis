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
  defaultTreatment?: string;
  defaultTextV?: string;
  defaultTextH?: string;
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
const isTreatment = (value: unknown): value is Treatment => TREATMENTS.some(item => item.id === value);
type VPos = 'top' | 'middle' | 'bottom';
type HAlign = 'left' | 'center' | 'right';
const V_POS: VPos[] = ['top', 'middle', 'bottom'];
const H_ALIGN: HAlign[] = ['left', 'center', 'right'];
const isVPos = (value: unknown): value is VPos => V_POS.includes(value as VPos);
const isHAlign = (value: unknown): value is HAlign => H_ALIGN.includes(value as HAlign);
const TREATMENT_DEFAULT_POSITION: Record<Treatment, { v: VPos; h: HAlign }> = {
  riviera_editorial: { v: 'top', h: 'right' },
  travel_poster: { v: 'top', h: 'left' },
  after_dark: { v: 'bottom', h: 'left' },
};
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

export const StudioCoverComposer: React.FC<Props> = ({ albumId, source, defaultTitle, defaultSubtitle = '', defaultSeries = 'Rekkrd After Dark', defaultTitleColor, defaultTitleFont, defaultSubtitleColor, defaultSubtitleFont, defaultSeriesColor, defaultSeriesFont, defaultTreatment, defaultTextV, defaultTextH, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const savedTypography = source.metadata_json?.typography;
  const initialTreatment = isTreatment(defaultTreatment) ? defaultTreatment : isTreatment(savedTypography?.treatment) ? savedTypography.treatment : 'riviera_editorial';
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [series, setSeries] = useState(defaultSeries || 'Rekkrd After Dark');
  const [treatment, setTreatment] = useState<Treatment>(initialTreatment);
  const [titleColor, setTitleColor] = useState(defaultTitleColor || TREATMENT_DEFAULT_COLOR[initialTreatment]);
  const [titleFont, setTitleFont] = useState<FontId>(isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT[initialTreatment]);
  const [subtitleColor, setSubtitleColor] = useState(defaultSubtitleColor || defaultTitleColor || TREATMENT_DEFAULT_COLOR[initialTreatment]);
  const [subtitleFont, setSubtitleFont] = useState<FontId>(isFontId(defaultSubtitleFont) ? defaultSubtitleFont : (isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT[initialTreatment]));
  const [seriesColor, setSeriesColor] = useState(defaultSeriesColor || DEFAULT_SERIES_COLOR);
  const [seriesFont, setSeriesFont] = useState<FontId>(isFontId(defaultSeriesFont) ? defaultSeriesFont : DEFAULT_SERIES_FONT);
  const [vPos, setVPos] = useState<VPos>(isVPos(defaultTextV) ? defaultTextV : isVPos(savedTypography?.text_v) ? savedTypography.text_v : TREATMENT_DEFAULT_POSITION[initialTreatment].v);
  const [hAlign, setHAlign] = useState<HAlign>(isHAlign(defaultTextH) ? defaultTextH : isHAlign(savedTypography?.text_h) ? savedTypography.text_h : TREATMENT_DEFAULT_POSITION[initialTreatment].h);
  const [vintageBorder, setVintageBorder] = useState(savedTypography?.vintage_border !== false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedTreatment = isTreatment(defaultTreatment) ? defaultTreatment : isTreatment(source.metadata_json?.typography?.treatment) ? source.metadata_json.typography.treatment : 'riviera_editorial';
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setSeries(defaultSeries || 'Rekkrd After Dark');
    setTreatment(savedTreatment);
    setTitleColor(defaultTitleColor || TREATMENT_DEFAULT_COLOR[savedTreatment]);
    setTitleFont(isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT[savedTreatment]);
    setSubtitleColor(defaultSubtitleColor || defaultTitleColor || TREATMENT_DEFAULT_COLOR[savedTreatment]);
    setSubtitleFont(isFontId(defaultSubtitleFont) ? defaultSubtitleFont : (isFontId(defaultTitleFont) ? defaultTitleFont : TREATMENT_DEFAULT_FONT[savedTreatment]));
    setSeriesColor(defaultSeriesColor || DEFAULT_SERIES_COLOR);
    setSeriesFont(isFontId(defaultSeriesFont) ? defaultSeriesFont : DEFAULT_SERIES_FONT);
    setVintageBorder(source.metadata_json?.typography?.vintage_border !== false);
    setVPos(isVPos(defaultTextV) ? defaultTextV : isVPos(source.metadata_json?.typography?.text_v) ? source.metadata_json.typography.text_v : TREATMENT_DEFAULT_POSITION[savedTreatment].v);
    setHAlign(isHAlign(defaultTextH) ? defaultTextH : isHAlign(source.metadata_json?.typography?.text_h) ? source.metadata_json.typography.text_h : TREATMENT_DEFAULT_POSITION[savedTreatment].h);
  }, [defaultSeries, defaultSubtitle, defaultTitle, defaultTitleColor, defaultTitleFont, defaultSubtitleColor, defaultSubtitleFont, defaultSeriesColor, defaultSeriesFont, defaultTreatment, defaultTextV, defaultTextH, source.id]);

  const changeTreatment = (next: Treatment) => {
    setTreatment(next);
    setTitleColor(TREATMENT_DEFAULT_COLOR[next]);
    setTitleFont(TREATMENT_DEFAULT_FONT[next]);
    setSubtitleColor(TREATMENT_DEFAULT_COLOR[next]);
    setSubtitleFont(TREATMENT_DEFAULT_FONT[next]);
    setVPos(TREATMENT_DEFAULT_POSITION[next].v);
    setHAlign(TREATMENT_DEFAULT_POSITION[next].h);
  };

  const loadSelectedFonts = useCallback(async () => {
    await Promise.all([
      document.fonts.load(`700 94px ${FONT_FAMILY[titleFont]}`, title.trim() || 'Album'),
      document.fonts.load(`${treatment === 'travel_poster' ? '700' : 'italic'} 31px ${FONT_FAMILY[subtitleFont]}`, subtitle.trim() || 'Subtitle'),
      document.fonts.load(`700 24px ${FONT_FAMILY[seriesFont]}`, series.trim() || 'Series'),
    ]);
  }, [series, seriesFont, subtitle, subtitleFont, title, titleFont, treatment]);

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

    const maxWidth = treatment === 'riviera_editorial' ? 500 : treatment === 'travel_poster' ? 650 : 830;
    let size = treatment === 'riviera_editorial' ? 72 : treatment === 'travel_poster' ? 94 : 82;
    const minimumSize = treatment === 'riviera_editorial' ? 44 : 54;
    const titleText = treatment === 'travel_poster' ? title.toUpperCase() : title;
    let lines: string[] = [];
    while (size >= minimumSize) {
      ctx.font = `700 ${size}px ${fontFamily}`;
      lines = wrapText(ctx, titleText, maxWidth, 3);
      if (lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
      size -= 4;
    }
    const lineHeight = size * (treatment === 'after_dark' ? 1.02 : 0.92);
    const subtitleSize = treatment === 'after_dark' ? 31 : 30;
    const subtitleBlock = subtitle.trim() ? subtitleSize * 1.35 + 12 : 0;
    const totalHeight = lines.length * lineHeight + subtitleBlock;
    const top = vPos === 'top' ? 70 : vPos === 'middle' ? Math.max(50, (H - totalHeight) / 2) : H - 92 - totalHeight;
    const x = hAlign === 'left' ? 70 : hAlign === 'center' ? W / 2 : W - 70;
    ctx.textAlign = hAlign;

    if (treatment === 'after_dark' && subtitle.trim()) {
      ctx.font = `italic ${subtitleSize}px ${subtitleFontFamily}`;
      ctx.fillStyle = subtitleColor;
      ctx.fillText(subtitle, x, top + subtitleSize);
    }
    ctx.font = `700 ${size}px ${fontFamily}`;
    ctx.fillStyle = titleColor;
    const titleTop = top + (treatment === 'after_dark' ? subtitleBlock : 0);
    lines.forEach((line, index) => ctx.fillText(line, x, titleTop + size + index * lineHeight));
    if (treatment !== 'after_dark' && subtitle.trim()) {
      ctx.font = `${treatment === 'travel_poster' ? '700' : 'italic'} ${subtitleSize}px ${subtitleFontFamily}`;
      ctx.fillStyle = subtitleColor;
      ctx.fillText(treatment === 'travel_poster' ? subtitle.toUpperCase() : subtitle, x, titleTop + lines.length * lineHeight + subtitleSize + 8);
    }

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.font = `700 24px ${seriesFontFamily}`;
    ctx.fillStyle = seriesColor;
    drawLetterspaced(ctx, (series.trim() || 'Rekkrd After Dark').toUpperCase(), W / 2, H - 36, 5, 'center');
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [hAlign, series, seriesColor, seriesFont, subtitle, subtitleColor, subtitleFont, title, titleColor, titleFont, treatment, vintageBorder, vPos]);

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

  useEffect(() => {
    let cancelled = false;
    void loadSelectedFonts()
      .then(() => { if (!cancelled) draw(); })
      .catch(() => { if (!cancelled) setError('Could not load the selected cover font. Try choosing it again.'); });
    return () => { cancelled = true; };
  }, [draw, loadSelectedFonts]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await loadSelectedFonts();
      draw();
      const concept = await saveStudioCoverComposite(albumId, source.id, canvas.toDataURL('image/png'), { title, subtitle, series: series.trim() || 'Rekkrd After Dark', treatment, vintage_border: vintageBorder, title_color: titleColor, title_font: titleFont, subtitle_color: subtitleColor, subtitle_font: subtitleFont, series_color: seriesColor, series_font: seriesFont, text_v: vPos, text_h: hAlign });
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

        <div className="rounded-xl border border-amber-200 bg-white/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Title block position</p>
          <p className="mt-1 text-xs text-slate-500">Move the album title and subtitle together.</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label="Title block position">
            {V_POS.flatMap(vertical => H_ALIGN.map(horizontal => <button key={`${vertical}-${horizontal}`} type="button" onClick={() => { setVPos(vertical); setHAlign(horizontal); }} aria-label={`${vertical} ${horizontal}`} className={`flex h-9 items-center justify-center rounded-lg border ${vPos === vertical && hAlign === horizontal ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white text-slate-500 hover:border-amber-400'}`}><span className={`h-2 w-2 rounded-full ${vPos === vertical && hAlign === horizontal ? 'bg-white' : 'bg-current'}`} /></button>))}
          </div>
        </div>

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

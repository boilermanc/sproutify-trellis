import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Image as ImageIcon, Loader2, Save } from 'lucide-react';
import { StudioCoverConcept } from '../types';
import { saveStudioThumbnailComposite } from '../services/studioAlbumsService';

interface Props {
  albumId: string;
  sourceImageUrl: string;
  defaultTitle: string;
  defaultSubtitle?: string;
  defaultTitleColor?: string;
  defaultTitleFont?: string;
  defaultTextV?: string;
  defaultTextH?: string;
  onSaved: (concept: StudioCoverConcept) => void;
}

const W = 1280;
const H = 720;

const FONT_OPTIONS = [
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat", Arial, sans-serif' },
  { id: 'oswald', label: 'Oswald', family: '"Oswald", Impact, sans-serif' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  { id: 'abril', label: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { id: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif' },
  { id: 'dm_serif', label: 'DM Serif Display', family: '"DM Serif Display", Georgia, serif' },
  { id: 'libre_baskerville', label: 'Libre Baskerville', family: '"Libre Baskerville", Georgia, serif' },
  { id: 'cinzel', label: 'Cinzel', family: '"Cinzel", Georgia, serif' },
  { id: 'anton', label: 'Anton', family: '"Anton", Impact, sans-serif' },
  { id: 'league_spartan', label: 'League Spartan', family: '"League Spartan", Arial, sans-serif' },
  { id: 'poppins', label: 'Poppins', family: '"Poppins", Arial, sans-serif' },
  { id: 'raleway', label: 'Raleway', family: '"Raleway", Arial, sans-serif' },
  { id: 'caveat', label: 'Caveat', family: '"Caveat", cursive' },
] as const;
type FontId = typeof FONT_OPTIONS[number]['id'];
const FONT_FAMILY: Record<FontId, string> = Object.fromEntries(FONT_OPTIONS.map(item => [item.id, item.family])) as Record<FontId, string>;
const isFontId = (value: unknown): value is FontId => FONT_OPTIONS.some(item => item.id === value);

type VPos = 'top' | 'middle' | 'bottom';
type HAlign = 'left' | 'center' | 'right';
const V_POS: VPos[] = ['top', 'middle', 'bottom'];
const H_ALIGN: HAlign[] = ['left', 'center', 'right'];
const isVPos = (value: unknown): value is VPos => V_POS.includes(value as VPos);
const isHAlign = (value: unknown): value is HAlign => H_ALIGN.includes(value as HAlign);

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
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

export const StudioThumbnailComposer: React.FC<Props> = ({ albumId, sourceImageUrl, defaultTitle, defaultSubtitle = '', defaultTitleColor, defaultTitleFont, defaultTextV, defaultTextH, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [titleColor, setTitleColor] = useState(defaultTitleColor || '#ffffff');
  const [titleFont, setTitleFont] = useState<FontId>(isFontId(defaultTitleFont) ? defaultTitleFont : 'montserrat');
  const [vPos, setVPos] = useState<VPos>(isVPos(defaultTextV) ? defaultTextV : 'bottom');
  const [hAlign, setHAlign] = useState<HAlign>(isHAlign(defaultTextH) ? defaultTextH : 'left');
  const [shade, setShade] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setTitleColor(defaultTitleColor || '#ffffff');
    setTitleFont(isFontId(defaultTitleFont) ? defaultTitleFont : 'montserrat');
    setVPos(isVPos(defaultTextV) ? defaultTextV : 'bottom');
    setHAlign(isHAlign(defaultTextH) ? defaultTextH : 'left');
  }, [defaultTitle, defaultSubtitle, defaultTitleColor, defaultTitleFont, defaultTextV, defaultTextH, sourceImageUrl]);

  const loadSelectedFont = useCallback(async () => {
    await document.fonts.load(`700 118px ${FONT_FAMILY[titleFont]}`, title.trim() || 'Title');
  }, [title, titleFont]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;
    const fontFamily = FONT_FAMILY[titleFont];
    ctx.clearRect(0, 0, W, H);
    const scale = Math.max(W / image.width, H / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);

    if (shade) {
      // A soft, full-width fade sitting behind wherever the text is, so the
      // title stays legible over any photo. Reads as a cinematic gradient,
      // never a boxed panel.
      let grad: CanvasGradient;
      if (vPos === 'top') {
        grad = ctx.createLinearGradient(0, 0, 0, H * 0.58);
        grad.addColorStop(0, 'rgba(6,10,20,0.82)');
        grad.addColorStop(1, 'rgba(6,10,20,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H * 0.58);
      } else if (vPos === 'middle') {
        grad = ctx.createLinearGradient(0, H * 0.18, 0, H * 0.82);
        grad.addColorStop(0, 'rgba(6,10,20,0)');
        grad.addColorStop(0.5, 'rgba(6,10,20,0.72)');
        grad.addColorStop(1, 'rgba(6,10,20,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, H * 0.18, W, H * 0.64);
      } else {
        grad = ctx.createLinearGradient(0, H * 0.42, 0, H);
        grad.addColorStop(0, 'rgba(6,10,20,0)');
        grad.addColorStop(1, 'rgba(6,10,20,0.82)');
        ctx.fillStyle = grad; ctx.fillRect(0, H * 0.42, W, H * 0.58);
      }
    }

    const maxWidth = W - 128;
    let size = 118;
    let lines: string[] = [];
    while (size >= 60) {
      ctx.font = `700 ${size}px ${fontFamily}`;
      lines = wrapText(ctx, title, maxWidth, 3);
      if (lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
      size -= 4;
    }
    const lineHeight = size * 1.04;
    const subSize = 34;
    const subBlock = subtitle.trim() ? subSize * 1.3 + 12 : 0;
    const totalH = subBlock + lines.length * lineHeight;
    const top = vPos === 'top' ? 52 : vPos === 'middle' ? Math.max(24, (H - totalH) / 2) : H - 52 - totalH;
    const x = hAlign === 'left' ? 64 : hAlign === 'center' ? W / 2 : W - 64;

    ctx.textBaseline = 'top';
    ctx.textAlign = hAlign;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;

    let y = top;
    if (subtitle.trim()) {
      ctx.font = `600 ${subSize}px ${fontFamily}`;
      ctx.fillStyle = titleColor;
      ctx.fillText(subtitle.toUpperCase(), x, y);
      y += subBlock;
    }
    ctx.font = `700 ${size}px ${fontFamily}`;
    ctx.fillStyle = titleColor;
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [hAlign, shade, subtitle, title, titleColor, titleFont, vPos]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        await document.fonts.ready;
        const response = await fetch(sourceImageUrl || '', { mode: 'cors' });
        if (!response.ok) throw new Error('Could not load the video image.');
        const bitmap = await createImageBitmap(await response.blob());
        if (!cancelled) { imageRef.current?.close(); imageRef.current = bitmap; draw(); }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the video image.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImageUrl]);

  useEffect(() => {
    let cancelled = false;
    void loadSelectedFont()
      .then(() => { if (!cancelled) draw(); })
      .catch(() => { if (!cancelled) setError('Could not load the selected thumbnail font. Try choosing it again.'); });
    return () => { cancelled = true; };
  }, [draw, loadSelectedFont]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      await loadSelectedFont();
      draw();
      const concept = await saveStudioThumbnailComposite(albumId, canvas.toDataURL('image/png'), { title, subtitle, title_color: titleColor, title_font: titleFont, text_v: vPos, text_h: hAlign });
      setSaved(true); onSaved(concept); window.setTimeout(() => setSaved(false), 3500);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the thumbnail.'); }
    finally { setSaving(false); }
  };

  return <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
    <div className="flex items-start gap-3"><ImageIcon className="mt-0.5 text-violet-700" size={18} /><div><p className="text-xs font-black uppercase tracking-widest text-violet-800">YouTube thumbnail</p><p className="mt-1 text-xs text-violet-900">The clickable 16:9 image on YouTube — big bold title over your video image. Separate from the video itself and the album cover.</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <canvas ref={canvasRef} width={W} height={H} className="aspect-video w-full rounded-xl border border-violet-200 bg-slate-900" />
      <div className="space-y-3">
        <div><p className="text-xs font-bold text-slate-700">Text position</p><div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-violet-200 bg-white p-1.5">{V_POS.map(v => H_ALIGN.map(h => { const active = vPos === v && hAlign === h; return <button type="button" key={`${v}-${h}`} aria-label={`${v} ${h}`} onClick={() => { setVPos(v); setHAlign(h); }} className={`flex h-8 items-center rounded-md ${h === 'left' ? 'justify-start' : h === 'center' ? 'justify-center' : 'justify-end'} ${v === 'top' ? 'items-start' : v === 'middle' ? 'items-center' : 'items-end'} px-1.5 py-1 ${active ? 'bg-violet-600' : 'bg-violet-50 hover:bg-violet-100'}`}><span className={`h-1.5 w-4 rounded-full ${active ? 'bg-white' : 'bg-violet-300'}`} /></button>; }))}</div></div>
        <label className="block text-xs font-bold text-slate-700">Font<select value={titleFont} onChange={event => setTitleFont(event.target.value as FontId)} className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm">{FONT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="block text-xs font-bold text-slate-700">Text color<input type="color" value={titleColor} onChange={event => setTitleColor(event.target.value)} className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-violet-200 bg-white p-1" /></label>
        <label className="block text-xs font-bold text-slate-700">Thumbnail title<textarea value={title} onChange={event => setTitle(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="block text-xs font-bold text-slate-700">Small line above<input value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={shade} onChange={event => setShade(event.target.checked)} className="h-4 w-4 accent-violet-700" /> Darken behind the title</label>
        <button type="button" onClick={save} disabled={saving || !title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? 'Thumbnail saved' : 'Save thumbnail'}</button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  </div>;
};

export default StudioThumbnailComposer;

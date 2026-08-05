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
] as const;
type FontId = typeof FONT_OPTIONS[number]['id'];
const FONT_FAMILY: Record<FontId, string> = Object.fromEntries(FONT_OPTIONS.map(item => [item.id, item.family])) as Record<FontId, string>;
const isFontId = (value: unknown): value is FontId => FONT_OPTIONS.some(item => item.id === value);

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

export const StudioThumbnailComposer: React.FC<Props> = ({ albumId, sourceImageUrl, defaultTitle, defaultSubtitle = '', defaultTitleColor, defaultTitleFont, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [titleColor, setTitleColor] = useState(defaultTitleColor || '#ffffff');
  const [titleFont, setTitleFont] = useState<FontId>(isFontId(defaultTitleFont) ? defaultTitleFont : 'montserrat');
  const [shade, setShade] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setTitleColor(defaultTitleColor || '#ffffff');
    setTitleFont(isFontId(defaultTitleFont) ? defaultTitleFont : 'montserrat');
  }, [defaultTitle, defaultSubtitle, defaultTitleColor, defaultTitleFont, sourceImageUrl]);

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
      // Full-width bottom-up gradient — reads as an intentional cinematic fade,
      // not a boxed panel. Only there to keep big title text legible over any photo.
      const grad = ctx.createLinearGradient(0, H * 0.42, 0, H);
      grad.addColorStop(0, 'rgba(6,10,20,0)');
      grad.addColorStop(1, 'rgba(6,10,20,0.82)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.42, W, H * 0.58);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;

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
    const firstBaseline = H - 60 - (lines.length - 1) * lineHeight;
    if (subtitle.trim()) {
      ctx.font = `600 34px ${fontFamily}`;
      ctx.fillStyle = titleColor;
      ctx.fillText(subtitle.toUpperCase(), 64, firstBaseline - size * 0.82 - 14);
    }
    ctx.font = `700 ${size}px ${fontFamily}`;
    ctx.fillStyle = titleColor;
    lines.forEach((line, index) => ctx.fillText(line, 64, firstBaseline + index * lineHeight));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [shade, subtitle, title, titleColor, titleFont]);

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

  useEffect(() => { draw(); }, [draw]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const concept = await saveStudioThumbnailComposite(albumId, canvas.toDataURL('image/png'), { title, subtitle, title_color: titleColor, title_font: titleFont });
      setSaved(true); onSaved(concept); window.setTimeout(() => setSaved(false), 3500);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the thumbnail.'); }
    finally { setSaving(false); }
  };

  return <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
    <div className="flex items-start gap-3"><ImageIcon className="mt-0.5 text-violet-700" size={18} /><div><p className="text-xs font-black uppercase tracking-widest text-violet-800">YouTube thumbnail</p><p className="mt-1 text-xs text-violet-900">The clickable 16:9 image on YouTube — big bold title over your video image. Separate from the video itself and the album cover.</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <canvas ref={canvasRef} width={W} height={H} className="aspect-video w-full rounded-xl border border-violet-200 bg-slate-900" />
      <div className="space-y-3">
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

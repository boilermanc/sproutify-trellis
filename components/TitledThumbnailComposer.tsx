import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Type, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  episodeId: string;
  coverUrl: string;
  defaultTitle: string;
  defaultSubtitle?: string;
  onSaved?: () => void;
}

const POSITIONS = [
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'center', label: 'Center' },
] as const;
type Pos = typeof POSITIONS[number]['id'];

const W = 1280;
const H = 720;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function initialText(defaultTitle: string, defaultSubtitle: string): { title: string; subtitle: string } {
  const title = defaultTitle.trim();
  const subtitle = defaultSubtitle.trim();
  if (!title || !subtitle) return { title, subtitle };

  const normalizedTitle = normalizeText(title);
  const normalizedSubtitle = normalizeText(subtitle);
  if (!normalizedSubtitle || !normalizedTitle.includes(normalizedSubtitle)) return { title, subtitle };

  const escaped = subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = title
    .replace(new RegExp(`^\\s*${escaped}\\s*(?:[-–—:|]+)\\s*`, 'i'), '')
    .trim();

  return {
    title: stripped || title,
    subtitle,
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Composites clean title typography over the generated cover in the browser (real
// fonts, live preview), then saves the flattened PNG via the save-episode-asset fn.
// Text is a proper overlay — never AI-rendered letters.
export const TitledThumbnailComposer: React.FC<Props> = ({ episodeId, coverUrl, defaultTitle, defaultSubtitle = '', onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bmpRef = useRef<ImageBitmap | null>(null);
  const defaults = initialText(defaultTitle, defaultSubtitle);
  const [title, setTitle] = useState(defaults.title);
  const [subtitle, setSubtitle] = useState(defaults.subtitle);
  const [position, setPosition] = useState<Pos>('bottom-left');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const next = initialText(defaultTitle, defaultSubtitle);
    setTitle(next.title);
    setSubtitle(next.subtitle);
  }, [defaultTitle, defaultSubtitle]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const bmp = bmpRef.current;
    if (bmp) {
      const scale = Math.max(W / bmp.width, H / bmp.height);
      const dw = bmp.width * scale, dh = bmp.height * scale;
      ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#0A0E27';
      ctx.fillRect(0, 0, W, H);
    }

    // Legibility scrim
    if (position === 'center') {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    const pad = 76;
    const align: CanvasTextAlign = position === 'bottom-left' ? 'left' : 'center';
    const cx = align === 'left' ? pad : W / 2;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';

    const maxW = position === 'bottom-left' ? W * 0.62 : W - pad * 2;
    let titleSize = position === 'center' ? 86 : 78;
    let lines: string[] = [];
    while (titleSize >= 50) {
      ctx.font = `700 ${titleSize}px Georgia, 'Times New Roman', serif`;
      lines = wrapText(ctx, title || '', maxW);
      if (lines.length <= 2 && lines.every(line => ctx.measureText(line).width <= maxW)) break;
      titleSize -= 4;
    }
    const lineH = titleSize * 1.04;
    const n = Math.max(1, lines.length);

    const firstBaseline = position === 'center'
      ? (H - n * lineH) / 2 + titleSize * 0.8
      : H - 86 - (n - 1) * lineH;

    // Subtitle (gold, above the title block)
    if (subtitle.trim()) {
      ctx.font = `600 28px Georgia, serif`;
      ctx.fillStyle = '#e8c88a';
      ctx.fillText(subtitle.toUpperCase(), cx, firstBaseline - lineH * 0.72);
    }

    // Title
    ctx.font = `700 ${titleSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 2;
    lines.forEach((ln, i) => ctx.fillText(ln, cx, firstBaseline + i * lineH));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }, [title, subtitle, position]);

  // Load the cover (via fetch → bitmap so the canvas isn't tainted on export)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(coverUrl, { mode: 'cors' });
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob);
        if (!cancelled) { bmpRef.current = bmp; draw(); }
      } catch {
        setErr('Could not load the cover image for compositing.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUrl]);

  useEffect(() => { draw(); }, [draw]);

  const save = async () => {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const canvas = canvasRef.current!;
      const dataUrl = canvas.toDataURL('image/png');
      const { data, error } = await supabase.functions.invoke('save-episode-asset', {
        body: { episode_id: episodeId, asset_type: 'thumbnail', image_base64: dataUrl, width: W, height: H, metadata: { title, subtitle, position } },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'save failed');
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 4000);
    } catch (e: any) {
      setErr(e?.message || 'Could not save thumbnail');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1"><Type size={12} /> Titled Thumbnail</p>
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-xl border border-slate-200 bg-slate-900" />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:border-emerald-500 outline-none" />
        <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle (optional)"
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:border-emerald-500 outline-none" />
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {POSITIONS.map(p => (
          <button key={p.id} type="button" onClick={() => setPosition(p.id)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tight transition ${position === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={save} disabled={saving}
          className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-700 transition disabled:opacity-40">
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saved ? 'Saved' : 'Save as Thumbnail'}
        </button>
      </div>
      {err && <p className="text-[10px] text-rose-500 mt-2">{err}</p>}
    </div>
  );
};

export default TitledThumbnailComposer;

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { fitText } from './fitText';

// ─── Freeform scene renderer ─────────────────────────────────────────
// One robust interpreter for an AI-authored declarative "scene": a
// background plus positioned, styled, animated text and shapes. This is the
// freeform alternative to the 7 fixed templates — the model designs the card
// by emitting a ClipScene (see the DSL below), and this component draws it.
//
// Everything is clamped and defaulted: a missing field, an out-of-range
// number, or an unknown element type never throws — it renders a safe
// approximation. Positions and sizes are PERCENTAGES of the 1080x1920 canvas
// so the design is resolution-independent; x,y are the element's CENTER.
// ─────────────────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const FONT = `'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const MAX_ELEMENTS = 14;

// ─── DSL ─────────────────────────────────────────────────────────────
export type SceneAnimType =
  | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
  | 'pop' | 'growWidth' | 'revealWords' | 'none';
export type SceneLoop = 'none' | 'breathe' | 'float' | 'pulse';

export interface SceneAnim { type?: SceneAnimType; delay?: number; duration?: number }

export interface SceneBackground {
  type?: 'solid' | 'linear' | 'radial';
  colors?: string[];
  angle?: number;
}

interface ElementBase {
  x?: number; y?: number;      // center, % of canvas
  w?: number; h?: number;      // size, % of canvas
  rotate?: number;             // degrees
  opacity?: number;            // 0-1
  enter?: SceneAnim;
  loop?: SceneLoop;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text?: string;
  size?: number;               // px @1080 basis; auto-shrinks to fit w
  weight?: number;             // 400-900
  color?: string;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  uppercase?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  highlight?: string[];        // words to color with highlightColor/accent
  highlightColor?: string;
}

export interface ShapeElement extends ElementBase {
  type: 'rect' | 'ellipse' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;             // rect corner px
  glow?: string;               // glow color
  blur?: number;               // px
}

export type SceneElement = TextElement | ShapeElement;

export interface ClipScene {
  background?: SceneBackground;
  bokeh?: boolean;
  vignette?: boolean;
  font?: string;               // brand font stack
  elements?: SceneElement[];
}

// ─── helpers ─────────────────────────────────────────────────────────
const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (v: unknown, d: string): string => (typeof v === 'string' && (HEX.test(v.trim()) || v === 'transparent') ? v.trim() : d);
const pctX = (v: number) => (v / 100) * W;
const pctY = (v: number) => (v / 100) * H;

function background(bg?: SceneBackground): string {
  const cols = (bg?.colors || []).filter(c => HEX.test(c));
  const c0 = cols[0] || '#080D12';
  const c1 = cols[1] || '#000000';
  const c2 = cols[2];
  if (bg?.type === 'linear') {
    const stops = c2 ? `${c0}, ${c1}, ${c2}` : `${c0}, ${c1}`;
    return `linear-gradient(${num(bg.angle, 180)}deg, ${stops})`;
  }
  if (bg?.type === 'radial') {
    return `radial-gradient(circle at 50% 42%, ${c0} 0%, ${c1} 100%)`;
  }
  return c0;
}

const Bokeh: React.FC<{ accent: string; count?: number }> = ({ accent, count = 10 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const seed = (i * 733) % 100;
        const x = (seed * 10.8) % W;
        const y = ((seed * 19.2 + i * 137) % H + frame * (0.2 + (i % 5) * 0.12)) % (H + 180) - 90;
        const size = 8 + (i % 6) * 9;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: H - y, width: size, height: size,
            borderRadius: '50%', background: accent, opacity: 0.05 + (i % 4) * 0.02,
            filter: `blur(${2 + (i % 3) * 4}px)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// Entrance transform + opacity for an element at the current frame.
function useEnter(enter: SceneAnim | undefined): { opacity: number; tx: number; ty: number; scale: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const type = enter?.type || 'fade';
  const delay = clamp(num(enter?.delay, 0), 0, 20) * fps;
  const dur = clamp(num(enter?.duration, 0.5), 0.1, 4) * fps;
  const t = clamp((frame - delay) / dur, 0, 1);
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: Math.round(dur) });
  const eased = interpolate(t, [0, 1], [0, 1]);
  switch (type) {
    case 'none': return { opacity: 1, tx: 0, ty: 0, scale: 1 };
    case 'slideUp': return { opacity: eased, tx: 0, ty: (1 - s) * 80, scale: 1 };
    case 'slideDown': return { opacity: eased, tx: 0, ty: (1 - s) * -80, scale: 1 };
    case 'slideLeft': return { opacity: eased, tx: (1 - s) * 80, ty: 0, scale: 1 };
    case 'slideRight': return { opacity: eased, tx: (1 - s) * -80, ty: 0, scale: 1 };
    case 'pop': return { opacity: eased, tx: 0, ty: 0, scale: 0.6 + s * 0.4 };
    default: return { opacity: eased, tx: 0, ty: 0, scale: 1 };
  }
}

function useLoop(loop: SceneLoop | undefined): { scale: number; ty: number } {
  const frame = useCurrentFrame();
  switch (loop) {
    case 'breathe': return { scale: 1 + Math.sin(frame / 18) * 0.03, ty: 0 };
    case 'float': return { scale: 1, ty: Math.sin(frame / 24) * 10 };
    case 'pulse': return { scale: 1 + Math.sin(frame / 8) * 0.02, ty: 0 };
    default: return { scale: 1, ty: 0 };
  }
}

// ─── element renderers ───────────────────────────────────────────────
const TextEl: React.FC<{ el: TextElement; font: string }> = ({ el, font }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = useEnter(el.enter);
  const loop = useLoop(el.loop);
  const wPct = clamp(num(el.w, 80), 5, 100);
  const boxW = pctX(wPct);
  const weight = clamp(num(el.weight, 700), 100, 900);
  const align = el.align === 'left' ? 'left' : el.align === 'right' ? 'right' : 'center';
  const raw = String(el.text ?? '');
  const text = el.uppercase ? raw.toUpperCase() : raw;
  const lineHeight = clamp(num(el.lineHeight, 1.25), 0.9, 2);
  const maxSize = clamp(num(el.size, 64), 12, 220);
  // Shrink to fit the width box so long lines never overflow the design.
  const { fontSize } = React.useMemo(() => fitText({
    text, maxWidth: boxW, maxHeight: H,
    maxFontSize: maxSize, minFontSize: Math.min(maxSize, 20),
    fontFamily: font, fontWeight: weight, lineHeight,
    letterSpacingPx: num(el.letterSpacing, 0),
  }), [text, boxW, maxSize, weight, lineHeight, font]);

  const hi = new Set((el.highlight || []).map(w => w.toLowerCase().replace(/[^\w']/g, '')));
  const hiColor = color(el.highlightColor, '#22d3ee');
  const base = color(el.color, '#ffffff');
  const words = text.split(/\s+/).filter(Boolean);
  const revealing = el.enter?.type === 'revealWords';

  return (
    <div style={{
      position: 'absolute', left: pctX(clamp(num(el.x, 50), 0, 100)), top: pctY(clamp(num(el.y, 50), 0, 100)),
      width: boxW, transform: `translate(-50%, -50%) translate(${enter.tx}px, ${enter.ty + loop.ty}px) rotate(${num(el.rotate, 0)}deg)`,
      opacity: clamp(num(el.opacity, 1), 0, 1) * (revealing ? 1 : enter.opacity),
      textAlign: align as React.CSSProperties['textAlign'],
      fontFamily: font, fontSize, fontWeight: weight, lineHeight, color: base,
      fontStyle: el.italic ? 'italic' : 'normal', letterSpacing: num(el.letterSpacing, 0),
    }}>
      {words.map((wd, i) => {
        const isHi = hi.has(wd.toLowerCase().replace(/[^\w']/g, ''));
        const s = revealing ? spring({ frame: frame - (num(el.enter?.delay, 0) * fps) - i * 3, fps, config: { damping: 200, stiffness: 120 } }) : 1;
        return (
          <span key={i} style={{
            display: 'inline-block', marginRight: fontSize * 0.28,
            opacity: revealing ? s : 1, transform: revealing ? `translateY(${(1 - s) * 24}px)` : 'none',
            color: isHi ? hiColor : base,
          }}>{wd}</span>
        );
      })}
    </div>
  );
};

const ShapeEl: React.FC<{ el: ShapeElement }> = ({ el }) => {
  const enter = useEnter(el.enter);
  const loop = useLoop(el.loop);
  const isLine = el.type === 'line';
  const wPct = clamp(num(el.w, 20), 0, 100);
  const hPct = clamp(num(el.h, isLine ? 0.4 : 10), 0, 100);
  const growing = el.enter?.type === 'growWidth';
  const wPx = pctX(wPct) * (growing ? enter.opacity : 1);
  const hPx = pctY(hPct);
  const fill = el.type === 'line' ? color(el.stroke ?? el.fill, '#ffffff') : color(el.fill, 'transparent');
  const stroke = color(el.stroke, 'transparent');
  const strokeWidth = clamp(num(el.strokeWidth, 0), 0, 40);
  const glow = el.glow && HEX.test(el.glow) ? el.glow : null;
  return (
    <div style={{
      position: 'absolute', left: pctX(clamp(num(el.x, 50), 0, 100)), top: pctY(clamp(num(el.y, 50), 0, 100)),
      width: wPx, height: isLine ? Math.max(2, hPx) : hPx,
      transform: `translate(-50%, -50%) translate(${enter.tx}px, ${enter.ty + loop.ty}px) rotate(${num(el.rotate, 0)}deg) scale(${enter.scale * loop.scale})`,
      opacity: clamp(num(el.opacity, 1), 0, 1) * (growing ? 1 : enter.opacity),
      background: fill,
      border: strokeWidth ? `${strokeWidth}px solid ${stroke}` : 'none',
      borderRadius: el.type === 'ellipse' ? '50%' : clamp(num(el.radius, 0), 0, 400),
      boxShadow: glow ? `0 0 ${clamp(num(el.blur, 60), 0, 300)}px ${glow}` : 'none',
      filter: el.blur && el.type !== 'rect' ? `blur(${clamp(num(el.blur, 0), 0, 60)}px)` : 'none',
    }} />
  );
};

// ─── scene ───────────────────────────────────────────────────────────
export const FreeformScene: React.FC<{ scene?: ClipScene }> = ({ scene }) => {
  const s = scene && typeof scene === 'object' ? scene : {};
  const font = (typeof s.font === 'string' && s.font) || FONT;
  const bgCols = (s.background?.colors || []).filter(c => HEX.test(c));
  const accent = bgCols[1] || bgCols[0] || '#22d3ee';
  const elements = Array.isArray(s.elements) ? s.elements.slice(0, MAX_ELEMENTS) : [];
  return (
    <AbsoluteFill style={{ background: background(s.background), fontFamily: font }}>
      {s.bokeh !== false && <Bokeh accent={accent} count={8} />}
      {elements.map((el, i) => {
        if (!el || typeof el !== 'object') return null;
        if (el.type === 'text') return <TextEl key={i} el={el as TextElement} font={font} />;
        if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'line') return <ShapeEl key={i} el={el as ShapeElement} />;
        return null;
      })}
      {s.vignette && (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
      )}
    </AbsoluteFill>
  );
};

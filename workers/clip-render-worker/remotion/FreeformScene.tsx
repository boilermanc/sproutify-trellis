import React from 'react';
import { AbsoluteFill, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
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
  | 'pop' | 'bounce' | 'growWidth' | 'revealWords' | 'blurIn' | 'none';
export type SceneLoop = 'none' | 'breathe' | 'float' | 'pulse' | 'spin' | 'sway';
// Whole-scene camera move — keeps the card alive after elements land.
export type SceneMotion = 'push' | 'pull' | 'driftLeft' | 'driftRight' | 'none';

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
  countUp?: boolean;           // if text is a number, animate 0 -> value
}

export interface ShapeElement extends ElementBase {
  type: 'rect' | 'ellipse' | 'line' | 'disc';
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
  motion?: SceneMotion;        // whole-scene camera move (default: subtle push)
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

// Entrance transform + opacity + blur for an element at the current frame.
function useEnter(enter: SceneAnim | undefined): { opacity: number; tx: number; ty: number; scale: number; blur: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const type = enter?.type || 'fade';
  const delay = clamp(num(enter?.delay, 0), 0, 20) * fps;
  const dur = clamp(num(enter?.duration, 0.5), 0.1, 4) * fps;
  const t = clamp((frame - delay) / dur, 0, 1);
  // Smooth driver for slides/fades (no overshoot).
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: Math.round(dur) });
  // Springy driver — light + underdamped so it overshoots and settles, giving
  // pops and bounces real energy (the "jazzy" feel).
  const sb = spring({ frame: frame - delay, fps, config: { mass: 0.7, stiffness: 120, damping: 11 } });
  const eased = interpolate(t, [0, 1], [0, 1]);
  switch (type) {
    case 'none': return { opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0 };
    case 'slideUp': return { opacity: eased, tx: 0, ty: (1 - s) * 80, scale: 1, blur: 0 };
    case 'slideDown': return { opacity: eased, tx: 0, ty: (1 - s) * -80, scale: 1, blur: 0 };
    case 'slideLeft': return { opacity: eased, tx: (1 - s) * 80, ty: 0, scale: 1, blur: 0 };
    case 'slideRight': return { opacity: eased, tx: (1 - s) * -80, ty: 0, scale: 1, blur: 0 };
    case 'pop': return { opacity: eased, tx: 0, ty: 0, scale: interpolate(sb, [0, 1], [0.55, 1]), blur: 0 };
    case 'bounce': return { opacity: eased, tx: 0, ty: (1 - sb) * 90, scale: 1, blur: 0 };
    case 'blurIn': return { opacity: eased, tx: 0, ty: (1 - s) * 20, scale: 0.98 + s * 0.02, blur: (1 - eased) * 22 };
    default: return { opacity: eased, tx: 0, ty: 0, scale: 1, blur: 0 };
  }
}

// Whole-scene camera move — a slow, continuous transform applied to all
// elements so the card keeps breathing after everything has landed.
function useCamera(motion: SceneMotion | undefined): string {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  switch (motion) {
    case 'none': return 'none';
    case 'pull': return `scale(${1.10 - p * 0.10})`;
    case 'driftLeft': return `scale(1.06) translateX(${p * -60}px)`;
    case 'driftRight': return `scale(1.06) translateX(${p * 60}px)`;
    case 'push':
    default: return `scale(${1 + p * 0.09})`; // subtle default push-in
  }
}

function useLoop(loop: SceneLoop | undefined): { scale: number; ty: number; rotate: number } {
  const frame = useCurrentFrame();
  switch (loop) {
    case 'breathe': return { scale: 1 + Math.sin(frame / 18) * 0.03, ty: 0, rotate: 0 };
    case 'float': return { scale: 1, ty: Math.sin(frame / 24) * 10, rotate: 0 };
    case 'pulse': return { scale: 1 + Math.sin(frame / 8) * 0.02, ty: 0, rotate: 0 };
    case 'spin': return { scale: 1, ty: 0, rotate: frame * 1.6 };        // continuous rotation (records, discs)
    case 'sway': return { scale: 1, ty: 0, rotate: Math.sin(frame / 22) * 5 };
    default: return { scale: 1, ty: 0, rotate: 0 };
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
  const uppercased = el.uppercase ? raw.toUpperCase() : raw;
  const lineHeight = clamp(num(el.lineHeight, 1.25), 0.9, 2);
  const delayF = num(el.enter?.delay, 0) * fps;

  // Count-up: animate a numeric value from 0 to its target after the entrance.
  const numMatch = el.countUp ? raw.match(/^(\D*)(\d[\d,]*)(.*)$/) : null;
  const settled = numMatch
    ? `${numMatch[1]}${(parseInt(numMatch[2].replace(/,/g, ''), 10) || 0).toLocaleString()}${numMatch[3]}`
    : uppercased;
  let text = uppercased;
  if (numMatch) {
    const target = parseInt(numMatch[2].replace(/,/g, ''), 10) || 0;
    const prog = clamp((frame - delayF) / (0.9 * fps), 0, 1);
    text = `${numMatch[1]}${Math.round(target * prog).toLocaleString()}${numMatch[3]}`;
  }

  // Ceiling is high so a hero word / giant number can truly dominate the frame;
  // fitText still shrinks it to fit the element's width box, so it never overflows.
  const maxSize = clamp(num(el.size, 64), 12, 560);
  // Fit on the SETTLED text so a counting number's size doesn't jump per frame.
  const { fontSize } = React.useMemo(() => fitText({
    text: settled, maxWidth: boxW, maxHeight: H,
    maxFontSize: maxSize, minFontSize: Math.min(maxSize, 20),
    fontFamily: font, fontWeight: weight, lineHeight,
    letterSpacingPx: num(el.letterSpacing, 0),
  }), [settled, boxW, maxSize, weight, lineHeight, font]);

  const hi = new Set((el.highlight || []).map(w => w.toLowerCase().replace(/[^\w']/g, '')));
  const hiColor = color(el.highlightColor, '#22d3ee');
  const base = color(el.color, '#ffffff');
  const words = text.split(/\s+/).filter(Boolean);
  const revealing = el.enter?.type === 'revealWords';
  const enterDurF = clamp(num(el.enter?.duration, 0.5), 0.1, 4) * fps;
  let hiIdx = 0;

  return (
    <div style={{
      position: 'absolute', left: pctX(clamp(num(el.x, 50), 0, 100)), top: pctY(clamp(num(el.y, 50), 0, 100)),
      width: boxW, transform: `translate(-50%, -50%) translate(${enter.tx}px, ${enter.ty + loop.ty}px) rotate(${num(el.rotate, 0) + loop.rotate}deg)`,
      opacity: clamp(num(el.opacity, 1), 0, 1) * (revealing ? 1 : enter.opacity),
      textAlign: align as React.CSSProperties['textAlign'],
      fontFamily: font, fontSize, fontWeight: weight, lineHeight, color: base,
      fontStyle: el.italic ? 'italic' : 'normal', letterSpacing: num(el.letterSpacing, 0),
      filter: enter.blur ? `blur(${enter.blur}px)` : 'none',
    }}>
      {words.map((wd, i) => {
        const isHi = hi.has(wd.toLowerCase().replace(/[^\w']/g, ''));
        const s = revealing ? spring({ frame: frame - delayF - i * 3, fps, config: { damping: 200, stiffness: 120 } }) : 1;
        // Highlight sweep: key words ignite into the accent a beat after landing.
        let wordColor = base;
        if (isHi) {
          const sweepStart = delayF + enterDurF + hiIdx * 6;
          wordColor = interpolateColors(frame, [sweepStart, sweepStart + 9], [base, hiColor]);
          hiIdx += 1;
        }
        return (
          <span key={i} style={{
            display: 'inline-block', marginRight: fontSize * 0.28,
            opacity: revealing ? s : 1, transform: revealing ? `translateY(${(1 - s) * 24}px)` : 'none',
            color: wordColor,
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
  // Shapes may run large and bleed past the edges — that's a deliberate design
  // move, so their size/position ranges are wider than text's.
  const wPct = clamp(num(el.w, 20), 0, 160);
  const hPct = clamp(num(el.h, isLine ? 0.4 : 10), 0, 160);
  const growing = el.enter?.type === 'growWidth';
  const wPx = pctX(wPct) * (growing ? enter.opacity : 1);
  const hPx = pctY(hPct);
  const fill = el.type === 'line' ? color(el.stroke ?? el.fill, '#ffffff') : color(el.fill, 'transparent');
  const stroke = color(el.stroke, 'transparent');
  const strokeWidth = clamp(num(el.strokeWidth, 0), 0, 40);
  const glow = el.glow && HEX.test(el.glow) ? el.glow : null;
  return (
    <div style={{
      position: 'absolute', left: pctX(clamp(num(el.x, 50), -30, 130)), top: pctY(clamp(num(el.y, 50), -30, 130)),
      width: wPx, height: isLine ? Math.max(2, hPx) : hPx,
      transform: `translate(-50%, -50%) translate(${enter.tx}px, ${enter.ty + loop.ty}px) rotate(${num(el.rotate, 0) + loop.rotate}deg) scale(${enter.scale * loop.scale})`,
      opacity: clamp(num(el.opacity, 1), 0, 1) * (growing ? 1 : enter.opacity),
      background: fill,
      border: strokeWidth ? `${strokeWidth}px solid ${stroke}` : 'none',
      borderRadius: el.type === 'ellipse' ? '50%' : clamp(num(el.radius, 0), 0, 400),
      boxShadow: glow ? `0 0 ${clamp(num(el.blur, 60), 0, 300)}px ${glow}` : 'none',
      filter: [enter.blur ? `blur(${enter.blur}px)` : '', (el.blur && el.type !== 'rect') ? `blur(${clamp(num(el.blur, 0), 0, 60)}px)` : ''].filter(Boolean).join(' ') || 'none',
    }} />
  );
};

// ─── Disc: a vinyl record motif (concentric grooves + accent label + spindle) ─
// Spins by default — the signature "jazzy" motif for a music brand. Built from
// nested radial gradients so it stays crisp at any size and needs no assets.
const Disc: React.FC<{ el: ShapeElement }> = ({ el }) => {
  const frame = useCurrentFrame();
  const enter = useEnter(el.enter);
  const spin = el.loop === 'none' ? 0 : frame * (el.loop === 'sway' ? 0 : 1.2); // spins unless loop:'none'
  const d = pctX(clamp(num(el.w, 40), 5, 160));
  const labelColor = color(el.fill, '#e8621a');          // accent label
  const disc = color(el.stroke, '#0b0b0d');              // vinyl body
  return (
    <div style={{
      position: 'absolute', left: pctX(clamp(num(el.x, 50), -30, 130)), top: pctY(clamp(num(el.y, 50), -30, 130)),
      width: d, height: d, borderRadius: '50%',
      transform: `translate(-50%, -50%) translate(${enter.tx}px, ${enter.ty}px) scale(${enter.scale}) rotate(${num(el.rotate, 0) + spin}deg)`,
      opacity: clamp(num(el.opacity, 1), 0, 1) * enter.opacity,
      // grooves: alternating dark rings; a subtle sheen; the whole disc in one bg
      background: `
        repeating-radial-gradient(circle at 50% 50%, ${disc} 0 6px, #17171a 6px 9px),
        radial-gradient(circle at 38% 32%, rgba(255,255,255,0.10) 0%, transparent 40%)`,
      boxShadow: `0 30px 90px rgba(0,0,0,0.6)${el.glow && HEX.test(el.glow) ? `, 0 0 80px ${el.glow}55` : ''}`,
    }}>
      {/* center label */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: d * 0.34, height: d * 0.34,
        transform: 'translate(-50%, -50%)', borderRadius: '50%', background: labelColor,
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.25)',
      }} />
      {/* spindle hole */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: d * 0.045, height: d * 0.045,
        transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#0b0b0d',
      }} />
    </div>
  );
};

// ─── scene ───────────────────────────────────────────────────────────
export const FreeformScene: React.FC<{ scene?: ClipScene }> = ({ scene }) => {
  const s = scene && typeof scene === 'object' ? scene : {};
  const font = (typeof s.font === 'string' && s.font) || FONT;
  const bgCols = (s.background?.colors || []).filter(c => HEX.test(c));
  const accent = bgCols[1] || bgCols[0] || '#22d3ee';
  const elements = Array.isArray(s.elements) ? s.elements.slice(0, MAX_ELEMENTS) : [];
  const camera = useCamera(s.motion);
  return (
    <AbsoluteFill style={{ background: background(s.background), fontFamily: font }}>
      {s.bokeh !== false && <Bokeh accent={accent} count={8} />}
      {/* Elements ride the slow camera move so the card keeps living after entrance. */}
      <AbsoluteFill style={{ transform: camera === 'none' ? undefined : camera, transformOrigin: '50% 50%' }}>
        {elements.map((el, i) => {
          if (!el || typeof el !== 'object') return null;
          if (el.type === 'text') return <TextEl key={i} el={el as TextElement} font={font} />;
          if (el.type === 'disc') return <Disc key={i} el={el as ShapeElement} />;
          if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'line') return <ShapeEl key={i} el={el as ShapeElement} />;
          return null;
        })}
      </AbsoluteFill>
      {s.vignette && (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
      )}
    </AbsoluteFill>
  );
};

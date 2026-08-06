import React from 'react';
import {
  AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { fitText } from './fitText';
import { FreeformScene, ClipScene } from './FreeformScene';

// ─── Trellis Clip Studio: the 7 B-roll beat templates ────────────────
// Every template is driven by the same flexible param bag filled by the
// B-roll planner (Gemini). Vertical 1080x1920 @ 30fps, dark editorial
// look, one accent color per beat. Text comes ONLY from the script.

export interface TemplateParams {
  headline?: string;
  subtext?: string;
  quote?: string;
  attribution?: string;
  accent?: string;
  bg?: string;
  font?: string;   // brand font-family stack; falls back to FONT
  items?: Array<{ label: string; sublabel?: string }>;
  highlight_words?: string[];
  scene?: ClipScene;  // freeform beat: an AI-authored scene spec (see FreeformScene)
}

export interface BeatProps {
  beatType: string;
  params: TemplateParams;
  durationSec: number;
}

const FONT = `'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const SERIF = `Georgia, 'Times New Roman', serif`;

const defaults = (p: TemplateParams) => ({
  accent: p.accent || '#22d3ee',
  bg: p.bg || '#080D12',
  font: p.font || FONT,
});

// Drifting bokeh dots used as depth on several templates.
const Bokeh: React.FC<{ accent: string; count?: number }> = ({ accent, count = 14 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const seed = (i * 733) % 100;
        const x = (seed * 10.8) % 1080;
        const y = ((seed * 19.2 + i * 137) % 1920 + frame * (0.2 + (i % 5) * 0.12)) % 2100 - 90;
        const size = 8 + (i % 6) * 9;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: 1920 - y, width: size, height: size,
            borderRadius: '50%', background: accent, opacity: 0.05 + (i % 4) * 0.02,
            filter: `blur(${2 + (i % 3) * 4}px)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const wordSpring = (frame: number, fps: number, index: number, stagger = 3) =>
  spring({ frame: frame - index * stagger, fps, config: { damping: 200, stiffness: 120 } });

// 1 ── KINETIC QUOTE CARD: cascading word reveal + attribution ─────────
const KineticQuoteCard: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const quoteText = params.quote || params.headline || '';
  const words = quoteText.split(/\s+/).filter(Boolean);
  const hi = new Set((params.highlight_words || []).map(w => w.toLowerCase().replace(/[^\w']/g, '')));
  const attrIn = interpolate(frame, [durationInFrames * 0.55, durationInFrames * 0.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, durationInFrames], [1, 1.02]);
  const { fontSize } = React.useMemo(() => fitText({
    text: quoteText, maxWidth: 880, maxHeight: params.attribution ? 1180 : 1320,
    maxFontSize: 74, minFontSize: 40, fontFamily: font, fontWeight: 800,
    lineHeight: 1.25, letterSpacingPx: -1, wordGapPx: 18,
  }), [quoteText, params.attribution]);
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font }}>
      <Bokeh accent={accent} count={8} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 100px', transform: `scale(${drift})` }}>
        <div style={{ fontSize, fontWeight: 800, lineHeight: 1.25, color: '#fff', letterSpacing: -1 }}>
          {words.map((w, i) => {
            const s = wordSpring(frame, fps, i);
            const isHi = hi.has(w.toLowerCase().replace(/[^\w']/g, ''));
            return (
              <span key={i} style={{
                display: 'inline-block', marginRight: 18,
                opacity: s, transform: `translateY(${(1 - s) * 26}px)`,
                color: isHi ? accent : '#fff',
              }}>{w}</span>
            );
          })}
        </div>
        {params.attribution && (
          <div style={{ marginTop: 70, opacity: attrIn }}>
            <div style={{ width: 120, height: 4, background: accent, marginBottom: 22 }} />
            <div style={{ fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{params.attribution}</div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 2 ── MOTION GRAPHIC: breathing orb + phrase ──────────────────────────
const MotionGraphic: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const breathe = 1 + Math.sin(frame / 18) * 0.05;
  const orbIn = spring({ frame, fps, config: { damping: 200 } });
  const textIn = interpolate(frame, [durationInFrames * 0.35, durationInFrames * 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headline = params.headline || '';
  const { fontSize } = React.useMemo(() => fitText({
    text: headline, maxWidth: 860, maxHeight: 520,
    maxFontSize: 64, minFontSize: 38, fontFamily: font, fontWeight: 800,
    lineHeight: 1.25, letterSpacingPx: -1,
  }), [headline]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, ${bg} 0%, #000 100%)`, fontFamily: font }}>
      <Bokeh accent={accent} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 340, height: 340, borderRadius: '50%',
          background: `radial-gradient(circle at 38% 34%, #fff 0%, ${accent} 28%, transparent 72%)`,
          filter: 'blur(2px)', transform: `scale(${orbIn * breathe})`,
          boxShadow: `0 0 220px 60px ${accent}44`,
        }} />
        <div style={{
          marginTop: 110, padding: '0 110px', textAlign: 'center',
          fontSize, fontWeight: 800, letterSpacing: -1, lineHeight: 1.25, color: '#fff',
          opacity: textIn, transform: `translateY(${(1 - textIn) * 30}px)`,
        }}>{headline}</div>
        {params.subtext && (
          <div style={{ marginTop: 30, fontSize: 32, fontWeight: 500, color: 'rgba(255,255,255,0.55)', opacity: textIn }}>{params.subtext}</div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 3 ── ANIMATION: translucent layer stack sliding under a device ───────
const AnimationT: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const textIn = interpolate(frame, [durationInFrames * 0.5, durationInFrames * 0.65], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headline = params.headline || '';
  const { fontSize } = React.useMemo(() => fitText({
    text: headline, maxWidth: 860, maxHeight: 380,
    maxFontSize: 54, minFontSize: 34, fontFamily: font, fontWeight: 700, lineHeight: 1.3,
  }), [headline]);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${bg} 0%, #060810 100%)`, fontFamily: font }}>
      <Bokeh accent={accent} count={10} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* device outline */}
        <div style={{
          width: 380, height: 720, borderRadius: 56, border: '5px solid rgba(255,255,255,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26,
          opacity: spring({ frame, fps, config: { damping: 200 } }),
        }}>
          {[0, 1, 2].map(i => {
            const s = spring({ frame: frame - 12 - i * 9, fps, config: { damping: 16, stiffness: 90 } });
            const glow = i === 2 ? 0.5 + Math.sin(frame / 12) * 0.2 : 0.18;
            return (
              <div key={i} style={{
                width: 260, height: 96, borderRadius: 24,
                background: `linear-gradient(120deg, ${accent}${i === 2 ? '66' : '22'}, rgba(255,255,255,0.10))`,
                border: `2px solid ${accent}55`, boxShadow: i === 2 ? `0 0 60px ${accent}${Math.round(glow * 99)}` : 'none',
                transform: `translateY(${(1 - s) * 220}px)`, opacity: s,
              }} />
            );
          })}
        </div>
        <div style={{
          marginTop: 80, padding: '0 110px', textAlign: 'center',
          fontSize, fontWeight: 700, lineHeight: 1.3, color: '#fff',
          opacity: textIn, transform: `translateY(${(1 - textIn) * 24}px)`,
        }}>{headline}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 4 ── UI CALLOUT: phone notification mock ─────────────────────────────
const UiCallout: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const cardIn = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 110 } });
  const message = params.headline || '';
  const { fontSize } = React.useMemo(() => fitText({
    text: message, maxWidth: 492, maxHeight: 760,
    maxFontSize: 40, minFontSize: 28, fontFamily: font, fontWeight: 600, lineHeight: 1.4,
  }), [message]);
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font }}>
      <Bokeh accent={accent} count={8} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 560, height: 1100, borderRadius: 72, background: '#0d1420',
          border: '4px solid rgba(255,255,255,0.14)', overflow: 'hidden', position: 'relative',
          opacity: spring({ frame, fps, config: { damping: 200 } }),
        }}>
          <div style={{ position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)', width: 160, height: 34, borderRadius: 20, background: '#000' }} />
          <div style={{
            position: 'absolute', top: 200, left: 34, right: 34, borderRadius: 30,
            background: 'rgba(255,255,255,0.97)', padding: '30px 34px',
            transform: `translateY(${(1 - cardIn) * -260}px)`, opacity: cardIn,
            boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: accent }} />
              <div style={{ fontSize: 30, fontWeight: 700, color: '#334', textTransform: 'uppercase', letterSpacing: 1 }}>{params.subtext || 'Agent'}</div>
            </div>
            <div style={{ fontSize, fontWeight: 600, lineHeight: 1.4, color: '#0f172a' }}>{message}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 5 ── TIMELINE: sequential eras/steps along a drawn line ──────────────
const TimelineT: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const items = (params.items || []).slice(0, 6);
  const lineW = interpolate(frame, [8, durationInFrames * 0.5], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headIn = spring({ frame, fps, config: { damping: 200 } });
  const headline = params.headline || '';
  const { fontSize } = React.useMemo(() => fitText({
    text: headline, maxWidth: 900, maxHeight: 360,
    maxFontSize: 56, minFontSize: 34, fontFamily: font, fontWeight: 800,
    lineHeight: 1.25, letterSpacingPx: -1,
  }), [headline]);
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font }}>
      <Bokeh accent={accent} count={8} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 90px' }}>
        <div style={{ fontSize, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 100, opacity: headIn, letterSpacing: -1 }}>
          {headline}
        </div>
        <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
          <div style={{ position: 'absolute', inset: 0, width: `${lineW}%`, background: accent, borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - 14 - i * 10, fps, config: { damping: 15, stiffness: 100 } });
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: accent, margin: '0 auto 18px', boxShadow: `0 0 26px ${accent}88` }} />
                <div style={{ fontSize: 34, fontWeight: 800, color: '#fff' }}>{it.label}</div>
                {it.sublabel && <div style={{ fontSize: 28, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>{it.sublabel}</div>}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 6 ── SOURCE RECEIPT CARD: document proof of a claim ──────────────────
const SourceReceiptCard: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const cardIn = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 90 } });
  const claimIn = interpolate(frame, [durationInFrames * 0.5, durationInFrames * 0.62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const claim = params.headline || '';
  const quote = params.quote || '';
  const claimFit = React.useMemo(() => fitText({
    text: claim, maxWidth: 920, maxHeight: 300,
    maxFontSize: 52, minFontSize: 32, fontFamily: font, fontWeight: 800,
    lineHeight: 1.3, letterSpacingPx: -1,
  }), [claim]);
  const quoteFit = React.useMemo(() => fitText({
    text: quote, maxWidth: 800, maxHeight: 700,
    maxFontSize: 44, minFontSize: 26, fontFamily: SERIF, fontWeight: 400, lineHeight: 1.5,
  }), [quote]);
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font }}>
      <Bokeh accent={accent} count={6} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
        {params.headline && (
          <div style={{ fontSize: claimFit.fontSize, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.3, marginBottom: 70, opacity: claimIn, letterSpacing: -1 }}>
            {claim}
          </div>
        )}
        <div style={{
          width: '100%', background: '#faf7f0', borderRadius: 22, padding: '54px 60px',
          transform: `translateY(${(1 - cardIn) * 320}px) rotate(${(1 - cardIn) * 2}deg)`, opacity: cardIn,
          boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30 }}>
            <div style={{ padding: '6px 16px', borderRadius: 8, background: accent, color: '#04121a', fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>SOURCE</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: 1 }}>{params.attribution || ''}</div>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: quoteFit.fontSize, fontStyle: 'italic', lineHeight: 1.5, color: '#1c1917' }}>
            “{quote}”
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 7 ── TEXT HIGHLIGHT: sentence with accent sweeps on key words ────────
const TextHighlight: React.FC<BeatProps> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent, bg, font } = defaults(params);
  const sentence = params.headline || '';
  const words = sentence.split(/\s+/).filter(Boolean);
  const hi = new Set((params.highlight_words || []).map(w => w.toLowerCase().replace(/[^\w']/g, '')));
  const sweepStart = durationInFrames * 0.4;
  let hiIndex = 0;
  const { fontSize } = React.useMemo(() => fitText({
    text: sentence, maxWidth: 880, maxHeight: 1320,
    maxFontSize: 78, minFontSize: 42, fontFamily: font, fontWeight: 800,
    lineHeight: 1.35, letterSpacingPx: -1, wordGapPx: 20,
  }), [sentence]);
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font }}>
      <Bokeh accent={accent} count={8} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 100px' }}>
        <div style={{ fontSize, fontWeight: 800, lineHeight: 1.35, color: '#fff', letterSpacing: -1 }}>
          {words.map((w, i) => {
            const s = wordSpring(frame, fps, i, 2);
            const isHi = hi.has(w.toLowerCase().replace(/[^\w']/g, ''));
            const sweep = isHi ? interpolate(frame, [sweepStart + hiIndex * 8, sweepStart + hiIndex * 8 + 10], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
            if (isHi) hiIndex += 1;
            return (
              <span key={i} style={{ display: 'inline-block', marginRight: 20, opacity: s, transform: `translateY(${(1 - s) * 22}px)`, position: 'relative' }}>
                {isHi && <span style={{ position: 'absolute', left: -8, right: -8, bottom: 6, top: 12, background: accent, opacity: 0.85, width: `calc(${sweep}% + 16px)`, zIndex: 0, borderRadius: 6 }} />}
                <span style={{ position: 'relative', zIndex: 1, color: isHi && sweep > 40 ? '#04121a' : '#fff' }}>{w}</span>
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Dispatcher ───────────────────────────────────────────────────────
export const ClipBeat: React.FC<BeatProps> = (props) => {
  // Freeform beats carry an AI-authored scene spec instead of template params.
  if (props.beatType === 'freeform' && props.params?.scene) {
    return <FreeformScene scene={props.params.scene} />;
  }
  switch (props.beatType) {
    case 'kinetic_quote_card': return <KineticQuoteCard {...props} />;
    case 'animation': return <AnimationT {...props} />;
    case 'ui_callout': return <UiCallout {...props} />;
    case 'timeline': return <TimelineT {...props} />;
    case 'source_receipt_card': return <SourceReceiptCard {...props} />;
    case 'text_highlight': return <TextHighlight {...props} />;
    case 'motion_graphic':
    default: return <MotionGraphic {...props} />;
  }
};

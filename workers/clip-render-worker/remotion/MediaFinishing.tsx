import React, { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';

export interface FinishCue {
  id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  position: 'top' | 'center' | 'bottom';
  animation: 'fade' | 'slide_up' | 'word_reveal';
}

export interface FinishStyle {
  font_id: 'cormorant' | 'abril' | 'bebas' | 'playfair' | 'oswald' | 'montserrat' | 'inter' | 'jetbrains';
  font_size: number;
  font_weight: 400 | 600 | 700 | 800 | 900;
  color: string;
  background_color: string;
  background_opacity: number;
  uppercase: boolean;
  shadow: boolean;
}

export interface MediaFinishingProps {
  sourceUrl: string;
  durationSec: number;
  width: number;
  height: number;
  cues: FinishCue[];
  style: FinishStyle;
}

const FONT_NAMES: Record<FinishStyle['font_id'], string> = {
  cormorant: 'Cormorant Garamond', abril: 'Abril Fatface', bebas: 'Bebas Neue',
  playfair: 'Playfair Display', oswald: 'Oswald', montserrat: 'Montserrat',
  inter: 'Inter', jetbrains: 'JetBrains Mono',
};

const GOOGLE_FONTS = '@import url("https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Bebas+Neue&family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&family=Montserrat:wght@400;600;700;800;900&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@400;600;700;800;900&display=swap");';

function rgba(hex: string, opacity: number) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '000000';
  const values = [0, 2, 4].map(index => Number.parseInt(safe.slice(index, index + 2), 16));
  return `rgba(${values[0]},${values[1]},${values[2]},${opacity})`;
}

export const MediaFinishing: React.FC<MediaFinishingProps> = ({ sourceUrl, cues, style }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const [fontHandle] = useState(() => delayRender('Loading finishing font'));
  const fontFamily = FONT_NAMES[style.font_id] || FONT_NAMES.inter;

  useEffect(() => {
    let active = true;
    document.fonts.load(`${style.font_weight} 64px "${fontFamily}"`).catch(() => undefined).finally(() => {
      if (active) continueRender(fontHandle);
    });
    return () => { active = false; };
  }, [fontFamily, fontHandle, style.font_weight]);

  const activeCues = useMemo(() => cues.filter(cue => frame >= cue.start_seconds * fps && frame <= cue.end_seconds * fps), [cues, fps, frame]);

  return <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <style>{GOOGLE_FONTS}</style>
    <OffthreadVideo src={sourceUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    {activeCues.map(cue => {
      const start = cue.start_seconds * fps;
      const end = cue.end_seconds * fps;
      const enterEnd = Math.min(end, start + 10);
      const exitStart = Math.max(start, end - 10);
      const opacity = Math.min(
        interpolate(frame, [start, enterEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        interpolate(frame, [exitStart, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      );
      const translateY = cue.animation === 'slide_up'
        ? interpolate(frame, [start, enterEnd], [height * 0.035, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : 0;
      const words = cue.text.trim().split(/\s+/);
      const reveal = Math.max(1, Math.ceil(words.length * interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
      const text = cue.animation === 'word_reveal' ? words.slice(0, reveal).join(' ') : cue.text;
      const vertical = cue.position === 'top' ? { top: '9%' } : cue.position === 'bottom' ? { bottom: '9%' } : { top: '50%', transform: `translateY(calc(-50% + ${translateY}px))` };
      return <div key={cue.id} style={{ position: 'absolute', left: '7%', right: '7%', display: 'flex', justifyContent: 'center', opacity, ...vertical, ...(cue.position !== 'center' && translateY ? { transform: `translateY(${translateY}px)` } : {}) }}>
        <div style={{
          maxWidth: '92%', padding: `${height * 0.014}px ${height * 0.024}px`, borderRadius: height * 0.018,
          backgroundColor: rgba(style.background_color, style.background_opacity), color: style.color,
          fontFamily: `"${fontFamily}", sans-serif`, fontSize: height * style.font_size,
          fontWeight: style.font_weight, lineHeight: 1.12, textAlign: 'center',
          textTransform: style.uppercase ? 'uppercase' : 'none',
          textShadow: style.shadow ? `0 ${height * 0.004}px ${height * 0.018}px rgba(0,0,0,.82)` : 'none',
          overflowWrap: 'anywhere',
        }}>{text}</div>
      </div>;
    })}
  </AbsoluteFill>;
};

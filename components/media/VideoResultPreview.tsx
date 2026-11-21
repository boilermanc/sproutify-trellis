import React, { useMemo, useState } from 'react';
import type { MediaTextCue, MediaTextStyle } from '../../types';
import { MEDIA_FONT_FAMILIES } from './mediaFonts';

interface Props {
  src: string;
  cues: MediaTextCue[];
  style?: MediaTextStyle;
}

const positionClass: Record<MediaTextCue['position'], string> = {
  top: 'top-[10%]',
  center: 'top-1/2 -translate-y-1/2',
  bottom: 'bottom-[10%]',
};

const DEFAULT_STYLE: MediaTextStyle = {
  font_id: 'inter', font_size: 0.07, font_weight: 800, color: '#ffffff',
  background_color: '#000000', background_opacity: 0.6, uppercase: false, shadow: true,
};

const hexToRgba = (hex: string, opacity: number) => {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '000000';
  const [r, g, b] = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const VideoResultPreview: React.FC<Props> = ({ src, cues, style = DEFAULT_STYLE }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const activeCues = useMemo(
    () => cues.filter(cue => currentTime >= cue.start_seconds && currentTime <= cue.end_seconds),
    [cues, currentTime],
  );

  return (
    <div className="mt-4">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <video
          controls
          src={src}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onSeeked={event => setCurrentTime(event.currentTarget.currentTime)}
          className="h-full w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {activeCues.map(cue => (
            <div key={cue.id} className={`absolute left-[8%] right-[8%] flex justify-center ${positionClass[cue.position]}`}>
              <span
                className={`max-w-[90%] rounded-xl px-4 py-2 text-center leading-tight backdrop-blur-sm ${cue.animation === 'slide_up' ? 'animate-[mediaTextSlideUp_350ms_ease-out]' : 'animate-[mediaTextFade_350ms_ease-out]'}`}
                style={{
                  color: style.color,
                  backgroundColor: hexToRgba(style.background_color, style.background_opacity),
                  fontFamily: MEDIA_FONT_FAMILIES[style.font_id],
                  fontSize: `clamp(16px, ${style.font_size * 9}vw, 44px)`,
                  fontWeight: style.font_weight,
                  textShadow: style.shadow ? '0 3px 12px rgba(0,0,0,.75)' : 'none',
                  textTransform: style.uppercase ? 'uppercase' : 'none',
                }}
              >
                {cue.animation === 'word_reveal'
                  ? cue.text.split(/\s+/).slice(0, Math.max(1, Math.ceil(cue.text.split(/\s+/).length * ((currentTime - cue.start_seconds) / Math.max(0.2, cue.end_seconds - cue.start_seconds))))).join(' ')
                  : cue.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      {cues.length > 0 && <p className="mt-2 text-[11px] leading-5 text-slate-500">This preview matches the saved timing and typography plan. Render final video creates a new MP4 and preserves the original.</p>}
    </div>
  );
};

export default VideoResultPreview;

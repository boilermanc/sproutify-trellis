import React, { useMemo, useState } from 'react';
import type { MediaTextCue } from '../../types';

interface Props {
  src: string;
  cues: MediaTextCue[];
}

const positionClass: Record<MediaTextCue['position'], string> = {
  top: 'top-[10%]',
  center: 'top-1/2 -translate-y-1/2',
  bottom: 'bottom-[10%]',
};

const VideoResultPreview: React.FC<Props> = ({ src, cues }) => {
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
              <span className={`max-w-[90%] rounded-xl bg-black/65 px-4 py-2 text-center text-lg font-black text-white shadow-lg backdrop-blur-sm ${cue.animation === 'slide_up' ? 'animate-[mediaTextSlideUp_350ms_ease-out]' : 'animate-[mediaTextFade_350ms_ease-out]'}`}>
                {cue.animation === 'word_reveal'
                  ? cue.text.split(/\s+/).slice(0, Math.max(1, Math.ceil(cue.text.split(/\s+/).length * ((currentTime - cue.start_seconds) / Math.max(0.2, cue.end_seconds - cue.start_seconds))))).join(' ')
                  : cue.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      {cues.length > 0 && <p className="mt-2 text-[11px] leading-5 text-slate-500">Text is previewed live from the editable timing plan. Export burn-in will be added with the finishing renderer.</p>}
    </div>
  );
};

export default VideoResultPreview;

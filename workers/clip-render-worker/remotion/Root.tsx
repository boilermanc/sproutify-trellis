import React from 'react';
import { Composition } from 'remotion';
import { ClipBeat, BeatProps } from './Templates';
import { MediaFinishing, MediaFinishingProps } from './MediaFinishing';

const FPS = 30;

export const Root: React.FC = () => <>
  <Composition
    id="ClipBeat"
    component={ClipBeat}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 6}
    defaultProps={{ beatType: 'motion_graphic', params: {}, durationSec: 6 } as BeatProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(FPS, Math.round((props.durationSec || 6) * FPS)),
    })}
  />
  <Composition
    id="MediaFinishing"
    component={MediaFinishing}
    width={854}
    height={480}
    fps={FPS}
    durationInFrames={FPS * 6}
    defaultProps={{ sourceUrl: '', durationSec: 6, width: 854, height: 480, cues: [], style: { font_id: 'inter', font_size: 0.07, font_weight: 800, color: '#ffffff', background_color: '#000000', background_opacity: 0.58, uppercase: false, shadow: true } } as MediaFinishingProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(FPS, Math.round((props.durationSec || 6) * FPS)),
      width: Math.max(2, Math.round((props.width || 854) / 2) * 2),
      height: Math.max(2, Math.round((props.height || 480) / 2) * 2),
    })}
  />
</>;

import React from 'react';
import { Composition } from 'remotion';
import { ClipBeat, BeatProps } from './Templates';

const FPS = 30;

export const Root: React.FC = () => (
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
);

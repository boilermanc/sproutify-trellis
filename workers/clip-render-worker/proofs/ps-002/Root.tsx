import React from 'react';
import { Composition } from 'remotion';
import { PromoProof, PromoProofProps } from './PromoProof';

const defaultProps: PromoProofProps = {
  duration_seconds: 10,
  fps: 30,
  capture: { kind: 'blocked_placeholder', media_type: 'still', file: 'capture-required.svg' },
  voice: { file: 'sample-vo.wav' },
  music: { file: 'synthetic-music-bed.wav' },
  captions: [{ start_seconds: 0.5, end_seconds: 2.5, text: 'Rekkrd Listening Room' }],
};

export const ProofRoot: React.FC = () => <Composition
  id="PromoProof"
  component={PromoProof}
  width={1080}
  height={1920}
  fps={30}
  durationInFrames={300}
  defaultProps={defaultProps}
  calculateMetadata={({ props }) => ({
    durationInFrames: Math.round(props.duration_seconds * props.fps),
    fps: props.fps,
  })}
/>;

import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, staticFile, useCurrentFrame } from 'remotion';

type CaptionCue = { start_seconds: number; end_seconds: number; text: string };

export type PromoProofProps = {
  duration_seconds: number;
  fps: number;
  capture: { kind: 'real_ui_capture' | 'blocked_placeholder'; media_type?: 'still' | 'video'; file: string };
  voice: { file: string };
  music: { file: string };
  captions: CaptionCue[];
  review_overlay?: string;
  provenance_label?: string;
  end_card?: { logo_file?: string; title: string; subtitle: string };
};

export const PromoProof: React.FC<PromoProofProps> = props => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, props.fps * props.duration_seconds], [1.035, 1.095], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const activeCaption = props.captions.find(cue => frame >= cue.start_seconds * props.fps && frame < cue.end_seconds * props.fps);
  const captureSource = staticFile(props.capture.file);
  const endCardFrame = Math.round(props.fps * 7);
  const captureOpacity = interpolate(frame, [endCardFrame - 12, endCardFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return <AbsoluteFill style={{ backgroundColor: '#13232b', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>
    <AbsoluteFill style={{ transform: `scale(${scale})`, padding: props.capture.media_type === 'still' ? '190px 34px 470px' : 0, opacity: captureOpacity }}>
      {props.capture.media_type === 'video'
        ? <Video src={captureSource} muted style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 30 }} />
        : <Img src={captureSource} style={{ width: '100%', height: '100%', objectFit: props.capture.kind === 'real_ui_capture' ? 'contain' : 'cover', borderRadius: 30 }} />}
    </AbsoluteFill>

    <Audio src={staticFile(props.voice.file)} volume={1} />
    <Audio src={staticFile(props.music.file)} volume={0.16} />

    {activeCaption && frame < endCardFrame && <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 72px 235px' }}>
      <div style={{ maxWidth: 930, padding: '22px 34px', borderRadius: 24, backgroundColor: 'rgba(12,22,27,0.88)', color: '#fffaf2', fontSize: 68, lineHeight: 1.05, fontWeight: 800, textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
        {activeCaption.text}
      </div>
    </AbsoluteFill>}

    {props.review_overlay && <Sequence from={0} durationInFrames={props.fps * props.duration_seconds}>
      <div style={{ position: 'absolute', left: 36, right: 36, top: 56, borderRadius: 18, padding: '18px 24px', color: '#fff', backgroundColor: 'rgba(180,52,31,0.94)', fontSize: 28, fontWeight: 900, letterSpacing: 1.4, textAlign: 'center' }}>
        {props.review_overlay}
      </div>
    </Sequence>}
    {props.provenance_label && <div style={{ position: 'absolute', left: 48, top: 64, borderRadius: 999, padding: '13px 20px', color: '#fffaf2', backgroundColor: 'rgba(19,35,43,0.88)', border: '1px solid rgba(255,250,242,0.28)', fontSize: 22, fontWeight: 800, letterSpacing: 1.2 }}>
      {props.provenance_label}
    </div>}
    {props.end_card && <Sequence from={endCardFrame} durationInFrames={props.fps * props.duration_seconds - endCardFrame}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 42%, #4b1728 0%, #260b15 48%, #13232b 100%)', color: '#fffaf2' }}>
        <div style={{ width: 330, height: 330, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(226,79,117,0.52)', boxShadow: '0 0 0 42px rgba(226,79,117,0.08), 0 0 0 84px rgba(226,79,117,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {props.end_card.logo_file
            ? <Img src={staticFile(props.end_card.logo_file)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#e24f75' }} />}
        </div>
        <div style={{ marginTop: 110, fontFamily: 'Georgia, serif', fontSize: 116, fontWeight: 700, letterSpacing: -4 }}>{props.end_card.title}</div>
        <div style={{ marginTop: 30, color: '#d7b8c1', fontSize: 38, letterSpacing: 3 }}>{props.end_card.subtitle}</div>
      </AbsoluteFill>
    </Sequence>}
  </AbsoluteFill>;
};

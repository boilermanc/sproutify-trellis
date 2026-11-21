import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { PromoVerticalScene, PromoVerticalStoryProps } from './types';

const externalSource = /^(https?:|data:|blob:)/i;
const mediaSource = (value?: string) => value ? (externalSource.test(value) ? value : staticFile(value)) : '';
const bounded = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const EmptyVisual: React.FC<{ accent: string; surface: string }> = ({ accent, surface }) => <AbsoluteFill
  style={{
    background: `radial-gradient(circle at 28% 22%, ${accent}55 0, transparent 34%), linear-gradient(145deg, ${surface}, ${accent}22)`,
  }}
/>;

const SceneVisual: React.FC<{ scene: PromoVerticalScene; accent: string; surface: string }> = ({ scene, accent, surface }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = Math.max(1, Math.round(scene.duration_seconds * fps));
  const fade = Math.min(10, Math.max(1, Math.floor(duration / 4)));
  const opacity = interpolate(frame, [0, fade, Math.max(fade, duration - fade), duration - 1], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [0, duration], [1.015, 1.055], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const source = mediaSource(scene.source);
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, backgroundColor: surface }}>
    {!source ? <EmptyVisual accent={accent} surface={surface} /> : scene.media_type === 'video'
      ? <Video src={source} muted style={{ width: '100%', height: '100%', objectFit: scene.fit }} />
      : <Img src={source} style={{ width: '100%', height: '100%', objectFit: scene.fit }} />}
  </AbsoluteFill>;
};

export const PromoVerticalStory: React.FC<PromoVerticalStoryProps> = props => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const safe = {
    top: bounded(Number(props.safe_area?.top) || 0, 0, 600),
    right: bounded(Number(props.safe_area?.right) || 0, 0, 300),
    bottom: bounded(Number(props.safe_area?.bottom) || 0, 0, 600),
    left: bounded(Number(props.safe_area?.left) || 0, 0, 300),
  };
  const brand = props.brand;
  const fontFamily = brand.font_family || 'Inter, Arial, sans-serif';
  const endCardFrame = props.end_card
    ? bounded(Math.round(props.end_card.start_seconds * fps), 0, durationInFrames)
    : durationInFrames;
  const caption = props.captions.find(cue => frame >= cue.start_seconds * fps && frame < cue.end_seconds * fps);
  const captionEnter = caption ? spring({ frame: Math.max(0, frame - Math.round(caption.start_seconds * fps)), fps, config: { damping: 200 } }) : 0;
  let sceneFrame = 0;

  return <AbsoluteFill style={{ backgroundColor: brand.background, color: brand.foreground, fontFamily, overflow: 'hidden' }}>
    <AbsoluteFill style={{
      background: `radial-gradient(circle at 18% 12%, ${brand.accent}24 0, transparent 31%), radial-gradient(circle at 88% 75%, ${brand.accent}18 0, transparent 35%)`,
    }} />

    <div style={{
      position: 'absolute', top: safe.top, left: safe.left, right: safe.right, height: 76,
      display: 'flex', alignItems: 'center', gap: 18, zIndex: 4,
    }}>
      {brand.logo_source && <Img src={mediaSource(brand.logo_source)} style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'contain' }} />}
      {brand.name && <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: 0.8 }}>{brand.name}</div>}
    </div>

    <div style={{
      position: 'absolute', top: safe.top + 108, left: safe.left, right: safe.right,
      bottom: safe.bottom + 235, borderRadius: 38, overflow: 'hidden', backgroundColor: brand.surface,
      boxShadow: '0 30px 90px rgba(0,0,0,0.28)', border: `1px solid ${brand.accent}33`,
    }}>
      {props.scenes.map(scene => {
        const from = sceneFrame;
        const sceneDuration = Math.max(1, Math.round(scene.duration_seconds * fps));
        sceneFrame += sceneDuration;
        return <Sequence key={scene.id} from={from} durationInFrames={sceneDuration} premountFor={Math.min(fps, sceneDuration)}>
          <SceneVisual scene={scene} accent={brand.accent} surface={brand.surface} />
        </Sequence>;
      })}
    </div>

    {caption && frame < endCardFrame && <div style={{
      position: 'absolute', left: safe.left + 18, right: safe.right + 18, bottom: safe.bottom + 38,
      minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5,
      opacity: captionEnter, transform: `translateY(${(1 - captionEnter) * 24}px)`,
    }}>
      <div style={{
        maxWidth: 900, padding: '24px 34px', borderRadius: 26, backgroundColor: `${brand.surface}f2`,
        color: brand.foreground, fontSize: 64, lineHeight: 1.08, fontWeight: 850, textAlign: 'center',
        boxShadow: '0 16px 50px rgba(0,0,0,0.3)',
      }}>{caption.text}</div>
    </div>}

    {props.voice_source && <Audio src={mediaSource(props.voice_source)} volume={1} />}
    {props.music_source && <Audio src={mediaSource(props.music_source)} volume={bounded(props.music_volume ?? 0.16, 0, 1)} />}

    {props.review?.overlay && <div style={{
      position: 'absolute', top: 28, left: 32, right: 32, zIndex: 10, padding: '15px 22px',
      borderRadius: 16, color: '#fff', backgroundColor: 'rgba(176,42,42,0.94)',
      fontSize: 25, fontWeight: 900, letterSpacing: 1.2, textAlign: 'center',
    }}>{props.review.overlay}</div>}
    {props.review?.provenance_label && <div style={{
      position: 'absolute', top: safe.top + 82, left: safe.left, zIndex: 6, padding: '10px 16px',
      borderRadius: 999, color: brand.foreground, backgroundColor: `${brand.surface}e8`,
      border: `1px solid ${brand.muted}55`, fontSize: 19, fontWeight: 800, letterSpacing: 1,
    }}>{props.review.provenance_label}</div>}

    {props.end_card && endCardFrame < durationInFrames && <Sequence from={endCardFrame} durationInFrames={durationInFrames - endCardFrame}>
      <EndCard props={props} />
    </Sequence>}

    <div style={{ position: 'absolute', left: safe.left, right: safe.right, bottom: Math.max(26, safe.bottom - 58), height: 5, borderRadius: 999, backgroundColor: `${brand.muted}44` }}>
      <div style={{ height: '100%', width: `${bounded(frame / Math.max(1, durationInFrames - 1), 0, 1) * 100}%`, borderRadius: 999, backgroundColor: brand.accent }} />
    </div>
  </AbsoluteFill>;
};

const EndCard: React.FC<{ props: PromoVerticalStoryProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = props.brand;
  const enter = spring({ frame, fps, config: { mass: 0.8, stiffness: 115, damping: 16 } });
  return <AbsoluteFill style={{
    zIndex: 8, alignItems: 'center', justifyContent: 'center', padding: '110px 72px', textAlign: 'center',
    background: `radial-gradient(circle at 50% 38%, ${brand.accent}42 0, transparent 35%), linear-gradient(155deg, ${brand.surface}, ${brand.background})`,
    color: brand.foreground,
  }}>
    {brand.logo_source && <Img src={mediaSource(brand.logo_source)} style={{
      width: 310, height: 310, borderRadius: 76, objectFit: 'contain',
      transform: `scale(${0.78 + enter * 0.22})`, opacity: enter,
      boxShadow: `0 0 0 36px ${brand.accent}16, 0 24px 80px rgba(0,0,0,0.28)`,
    }} />}
    {props.end_card?.title && <div style={{ marginTop: 88, fontSize: 104, lineHeight: 1, fontWeight: 900, letterSpacing: -3, opacity: enter }}>{props.end_card.title}</div>}
    {props.end_card?.subtitle && <div style={{ marginTop: 30, maxWidth: 850, color: brand.muted, fontSize: 38, lineHeight: 1.2, fontWeight: 600, opacity: enter }}>{props.end_card.subtitle}</div>}
  </AbsoluteFill>;
};

export const promoVerticalStoryDefaultProps: PromoVerticalStoryProps = {
  duration_seconds: 10,
  scenes: [{ id: 'sample', duration_seconds: 7.2, media_type: 'still', source: '', fit: 'contain' }],
  captions: [],
  safe_area: { top: 96, right: 48, bottom: 180, left: 48 },
  brand: {
    name: 'Preview', background: '#10161d', surface: '#18232d', foreground: '#f7f8fa',
    muted: '#aab6c2', accent: '#52c995', font_family: 'Inter, Arial, sans-serif',
  },
  end_card: { start_seconds: 7.2 },
};

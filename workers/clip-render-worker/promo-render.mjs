import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCorrectionArgs, buildFinalizeArgs, buildLoudnessAnalysisArgs, buildProbeArgs,
} from '../promo-render-worker/pipeline.mjs';

const workerRoot = path.dirname(fileURLToPath(import.meta.url));
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const extensionByMime = Object.freeze({
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
});

const run = (command, args, label) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 600000, killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`${label} failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (status ${result.status}, signal ${result.signal || 'none'}): ${(result.stderr || result.stdout || '').slice(-2000)}`);
  }
  return result;
};

const measureLoudness = file => {
  const result = run('ffmpeg', buildLoudnessAnalysisArgs(file, nullDevice), 'FFmpeg loudness analysis');
  const matches = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) throw new Error('FFmpeg did not return loudness analysis JSON.');
  return JSON.parse(matches.at(-1));
};

const rational = value => {
  const [top, bottom = '1'] = String(value || '').split('/').map(Number);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : NaN;
};

const materialize = (resolvedAssets, publicDir) => {
  const byRole = new Map();
  for (const asset of resolvedAssets.values()) {
    const extension = extensionByMime[asset.mime_type];
    if (!extension) throw new Error(`Unsupported render asset MIME type: ${asset.mime_type}`);
    const filename = `${asset.asset_id}.${extension}`;
    writeFileSync(path.join(publicDir, filename), asset.bytes);
    for (const role of asset.roles) byRole.set(role, { filename, mime_type: asset.mime_type });
  }
  return byRole;
};

const buildInputProps = (job, byRole) => {
  const input = job.input;
  const sourceFor = role => byRole.get(role)?.filename;
  return {
    duration_seconds: input.timeline.target_seconds,
    scenes: input.timeline.scenes.map(scene => {
      const source = byRole.get(`scene:${scene.scene_id}`);
      if (!source) throw new Error(`Materialized scene asset is missing: ${scene.scene_id}`);
      return {
        id: scene.scene_id, duration_seconds: scene.duration_seconds,
        media_type: source.mime_type.startsWith('video/') ? 'video' : 'still',
        source: source.filename, fit: input.format.crop_policy === 'cover' ? 'cover' : 'contain',
      };
    }),
    captions: input.timeline.captions.map(cue => ({
      start_seconds: cue.start_seconds, end_seconds: cue.end_seconds, text: cue.text,
    })),
    voice_source: sourceFor('voice'), music_source: sourceFor('music'), music_volume: 0.16,
    safe_area: input.format.safe_area,
    brand: {
      name: input.presentation.brand.name, logo_source: sourceFor('brand:logo'),
      background: input.presentation.brand.background, surface: input.presentation.brand.surface,
      foreground: input.presentation.brand.foreground, muted: input.presentation.brand.muted,
      accent: input.presentation.brand.accent,
      font_family: `${input.presentation.brand.display_font}, ${input.presentation.brand.label_font}, sans-serif`,
    },
    review: input.review.provenance_overlay ? { overlay: 'PREVIEW • PROVENANCE ON' } : undefined,
  };
};

export async function renderPromoVertical({ job, resolvedAssets, heartbeat = async () => {} }) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'trellis-promo-render-'));
  try {
    const publicDir = path.join(temporaryRoot, 'assets');
    mkdirSync(publicDir);
    const inputProps = buildInputProps(job, materialize(resolvedAssets, publicDir));
    await heartbeat(35);
    const serveUrl = await bundle({ entryPoint: path.join(workerRoot, 'remotion', 'index.ts'), publicDir });
    const composition = await selectComposition({ serveUrl, id: 'vertical-ui-story', inputProps });
    const remotionOutput = path.join(temporaryRoot, 'remotion.mp4');
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: remotionOutput, inputProps });
    await heartbeat(65);

    const normalizedOutput = path.join(temporaryRoot, 'normalized.mp4');
    run('ffmpeg', buildFinalizeArgs({
      inputPath: remotionOutput, outputPath: normalizedOutput,
      targetSeconds: inputProps.duration_seconds, measurement: measureLoudness(remotionOutput),
    }), 'FFmpeg finalization');
    const finalOutput = path.join(temporaryRoot, 'final.mp4');
    run('ffmpeg', buildCorrectionArgs({
      inputPath: normalizedOutput, outputPath: finalOutput, targetSeconds: inputProps.duration_seconds,
      measuredIntegratedLufs: measureLoudness(normalizedOutput).input_i,
    }), 'FFmpeg loudness correction');
    await heartbeat(78);

    const probe = JSON.parse(run('ffprobe', buildProbeArgs(finalOutput), 'ffprobe delivery validation').stdout);
    const video = probe.streams?.find(stream => stream.codec_type === 'video');
    const audio = probe.streams?.find(stream => stream.codec_type === 'audio');
    const bytes = readFileSync(finalOutput);
    const moov = bytes.indexOf(Buffer.from('moov'));
    const mdat = bytes.indexOf(Buffer.from('mdat'));
    const loudness = measureLoudness(finalOutput);
    return Object.freeze({
      bytes, width: video?.width, height: video?.height, fps: rational(video?.r_frame_rate),
      duration_seconds: Number(probe.format?.duration), video_codec: video?.codec_name,
      pixel_format: video?.pix_fmt, audio_codec: audio?.codec_name,
      audio_sample_rate: Number(audio?.sample_rate), faststart: moov >= 0 && mdat >= 0 && moov < mdat,
      color_range: video?.color_range, integrated_lufs: Number(loudness.input_i),
      true_peak_dbfs: Number(loudness.input_tp),
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

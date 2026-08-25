import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundle } from '../../../../workers/clip-render-worker/node_modules/@remotion/bundler/dist/index.js';
import { renderMedia, renderStill, selectComposition } from '../../../../workers/clip-render-worker/node_modules/@remotion/renderer/dist/index.js';
import { validateLoudness, validateProbe } from '../../ps-002/scripts/proof-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sampleRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(sampleRoot, '../../..');
const workerRoot = path.join(repoRoot, 'workers', 'clip-render-worker');
const proofRoot = path.join(repoRoot, 'work', 'promo-studio', 'ps-002');
const assetDir = path.join(proofRoot, 'assets');
const outputDir = path.join(sampleRoot, 'output');
const proof = JSON.parse(fs.readFileSync(path.join(proofRoot, 'manifest', 'proof-manifest.json'), 'utf8'));
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
const reuseRemotion = process.argv.includes('--reuse-remotion');

const measureLoudness = file => {
  const analysis = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json',
    '-f', 'null', nullDevice,
  ], { encoding: 'utf8' });
  if (analysis.status !== 0) throw new Error(`FFmpeg loudness analysis failed: ${analysis.stderr}`);
  const matches = analysis.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) throw new Error('FFmpeg did not return loudness analysis JSON.');
  return JSON.parse(matches.at(-1));
};

const inputProps = {
  duration_seconds: proof.duration_seconds,
  scenes: [{
    id: 'real-ui', duration_seconds: 7, media_type: proof.capture.media_type,
    source: proof.capture.file, fit: 'contain',
  }],
  captions: proof.captions,
  voice_source: proof.voice.file,
  music_source: proof.music.file,
  music_volume: 0.16,
  safe_area: { top: 96, right: 48, bottom: 180, left: 48 },
  brand: {
    name: proof.project.display_name,
    logo_source: proof.end_card.logo_file,
    background: '#160a0f',
    surface: '#2b111c',
    foreground: '#fff8f4',
    muted: '#d5a3af',
    accent: '#e05073',
    font_family: 'Inter, Arial, sans-serif',
  },
  review: { provenance_label: proof.provenance_label },
  end_card: {
    start_seconds: 7,
    title: proof.end_card.title,
    subtitle: proof.end_card.subtitle,
  },
};

fs.mkdirSync(outputDir, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.join(workerRoot, 'remotion', 'index.ts'),
  publicDir: assetDir,
});
const composition = await selectComposition({ serveUrl, id: 'vertical-ui-story', inputProps });
const remotionOutput = path.join(outputDir, 'vertical-ui-story-v1-remotion.mp4');
if (!reuseRemotion || !fs.existsSync(remotionOutput)) {
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: remotionOutput, inputProps });
}

await Promise.all([
  renderStill({ composition, serveUrl, output: path.join(outputDir, 'vertical-ui-story-v1-ui.png'), inputProps, frame: 75, imageFormat: 'png' }),
  renderStill({ composition, serveUrl, output: path.join(outputDir, 'vertical-ui-story-v1-end-card.png'), inputProps, frame: 250, imageFormat: 'png' }),
]);

const measuredInput = measureLoudness(remotionOutput);
const loudnessFilter = [
  'loudnorm=I=-14:TP=-1.5:LRA=7',
  `measured_I=${measuredInput.input_i}`,
  `measured_TP=${measuredInput.input_tp}`,
  `measured_LRA=${measuredInput.input_lra}`,
  `measured_thresh=${measuredInput.input_thresh}`,
  `offset=${measuredInput.target_offset}`,
  'linear=false',
].join(':');
const normalizedOutput = path.join(outputDir, 'vertical-ui-story-v1-normalized.mp4');
const finalize = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', remotionOutput,
  '-t', String(inputProps.duration_seconds),
  '-af', loudnessFilter,
  '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', '30',
  '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
  normalizedOutput,
], { encoding: 'utf8' });
if (finalize.status !== 0) throw new Error(`FFmpeg finalization failed: ${finalize.stderr}`);

const normalizedMeasurement = measureLoudness(normalizedOutput);
const correctionDb = -14 - Number(normalizedMeasurement.input_i);
const finalOutput = path.join(outputDir, 'vertical-ui-story-v1.mp4');
const correct = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', normalizedOutput,
  '-t', String(inputProps.duration_seconds),
  '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
  '-af', `volume=${correctionDb.toFixed(3)}dB,alimiter=limit=0.79:level=false`,
  '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
  finalOutput,
], { encoding: 'utf8' });
if (correct.status !== 0) throw new Error(`FFmpeg loudness correction failed: ${correct.stderr}`);

const probeResult = spawnSync('ffprobe', [
  '-v', 'error', '-show_streams', '-show_format', '-of', 'json', finalOutput,
], { encoding: 'utf8' });
if (probeResult.status !== 0) throw new Error(`ffprobe failed: ${probeResult.stderr}`);
const media = validateProbe(JSON.parse(probeResult.stdout));
const loudness = validateLoudness(measureLoudness(finalOutput));
if (Math.abs(media.duration - inputProps.duration_seconds) > 0.05) {
  throw new Error(`Final duration ${media.duration}s exceeds the 0.05s production tolerance.`);
}
if (loudness.integrated_lufs < -14.5 || loudness.integrated_lufs > -13.5) {
  throw new Error(`Final loudness ${loudness.integrated_lufs} LUFS is outside -14 ±0.5 LU.`);
}
if (loudness.true_peak_dbfs > -1.5) {
  throw new Error(`Final true peak ${loudness.true_peak_dbfs} dBFS exceeds -1.5 dBFS.`);
}
const qa = {
  status: 'passed',
  composition: 'vertical-ui-story@v1',
  output: finalOutput,
  media,
  loudness,
  fixture: {
    branch_slug: proof.project.branch_slug,
    capture_checksum_sha256: proof.capture.checksum_sha256,
    logo_checksum_sha256: proof.end_card.logo_checksum_sha256,
  },
};
fs.writeFileSync(path.join(outputDir, 'vertical-ui-story-v1-qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
console.log(JSON.stringify(qa, null, 2));

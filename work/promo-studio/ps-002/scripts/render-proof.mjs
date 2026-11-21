import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundle } from '../../../../workers/clip-render-worker/node_modules/@remotion/bundler/dist/index.js';
import { renderMedia, selectComposition } from '../../../../workers/clip-render-worker/node_modules/@remotion/renderer/dist/index.js';
import { validateLoudness, validateManifest, validateProbe } from './proof-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const proofRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(proofRoot, '../../..');
const workerRoot = path.join(repoRoot, 'workers', 'clip-render-worker');
const manifestArgIndex = process.argv.indexOf('--manifest');
const manifestPath = manifestArgIndex >= 0
  ? path.resolve(process.argv[manifestArgIndex + 1])
  : path.join(proofRoot, 'manifest', 'proof-manifest.json');
const assetDir = path.join(proofRoot, 'assets');
const outputDir = path.join(proofRoot, 'output');
const allowFoundationAssets = process.argv.includes('--allow-foundation-assets');
const reuseRemotion = process.argv.includes('--reuse-remotion');
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

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

fs.mkdirSync(outputDir, { recursive: true });
const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), {
  allowFoundationAssets,
  assetDir,
});

const serveUrl = await bundle({
  entryPoint: path.join(workerRoot, 'proofs', 'ps-002', 'index.ts'),
  publicDir: assetDir,
});
const composition = await selectComposition({ serveUrl, id: 'PromoProof', inputProps: manifest });
const safeProofId = manifest.proof_id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
const remotionOutput = path.join(outputDir, `${safeProofId}-remotion.mp4`);
if (!reuseRemotion || !fs.existsSync(remotionOutput)) {
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: remotionOutput,
    inputProps: manifest,
  });
}

const finalOutput = path.join(outputDir, `${safeProofId}.mp4`);
const measuredInput = measureLoudness(remotionOutput);
const loudnessFilter = [
  'loudnorm=I=-14:TP=-1.5:LRA=7',
  `measured_I=${measuredInput.input_i}`,
  `measured_TP=${measuredInput.input_tp}`,
  `measured_LRA=${measuredInput.input_lra}`,
  `measured_thresh=${measuredInput.input_thresh}`,
  `offset=${measuredInput.target_offset}`,
  'linear=true',
].join(':');
const finalize = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', remotionOutput,
  '-af', loudnessFilter,
  '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', '30',
  '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
  finalOutput,
], { encoding: 'utf8' });
if (finalize.status !== 0) throw new Error(`FFmpeg finalization failed: ${finalize.stderr}`);

const probeResult = spawnSync('ffprobe', [
  '-v', 'error', '-show_streams', '-show_format', '-of', 'json', finalOutput,
], { encoding: 'utf8' });
if (probeResult.status !== 0) throw new Error(`ffprobe failed: ${probeResult.stderr}`);
const probe = JSON.parse(probeResult.stdout);
const qa = validateProbe(probe);
const loudness = validateLoudness(measureLoudness(finalOutput));
const report = {
  status: allowFoundationAssets ? 'foundation_only_blocked_on_real_capture' : 'passed',
  output: finalOutput,
  qa,
  loudness,
  provenance: manifest.capture,
};
fs.writeFileSync(path.join(outputDir, `${safeProofId}-qa.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

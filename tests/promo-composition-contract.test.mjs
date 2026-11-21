import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PROMO_COMPOSITIONS } from '../supabase/functions/_shared/promo-compositions.ts';
import {
  buildCorrectionArgs, buildFinalizeArgs, buildLoudnessAnalysisArgs, buildProbeArgs,
} from '../workers/promo-render-worker/pipeline.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('vertical-ui-story is registered at the proven vertical profile', async () => {
  const [root, registry] = await Promise.all([
    read('../workers/clip-render-worker/remotion/Root.tsx'),
    read('../supabase/functions/_shared/promo-compositions.ts'),
  ]);
  assert.match(root, /id="vertical-ui-story"/);
  assert.match(root, /width=\{1080\}/);
  assert.match(root, /height=\{1920\}/);
  assert.match(root, /fps=\{FPS\}/);
  assert.match(root, /durationInFrames=\{FPS \* 10\}/);
  assert.match(registry, /key: "vertical-ui-story"[\s\S]*version: "v1"/);
  assert.match(registry, /key: "vertical-ui-story"[\s\S]*worker_enabled: true/);
  const definition = PROMO_COMPOSITIONS.find(item => item.key === 'vertical-ui-story' && item.version === 'v1');
  assert.equal(definition?.status, 'worker_enabled');
  const composition = (await read('../workers/clip-render-worker/remotion/PromoVerticalStory.tsx')).replace(/\r\n/g, '\n');
  assert.equal(
    createHash('sha256').update(composition, 'utf8').digest('hex'),
    definition?.source_fingerprint_sha256,
  );
});

test('every registered composition fingerprint pins its exact normalized source', async () => {
  const sourceByKey = new Map([
    ['PromoProof@ps-002-v1', '../workers/clip-render-worker/proofs/ps-002/PromoProof.tsx'],
    ['vertical-ui-story@v1', '../workers/clip-render-worker/remotion/PromoVerticalStory.tsx'],
  ]);

  for (const definition of PROMO_COMPOSITIONS) {
    const sourcePath = sourceByKey.get(`${definition.key}@${definition.version}`);
    assert.ok(sourcePath, `Missing source mapping for ${definition.key}@${definition.version}`);
    const source = (await read(sourcePath)).replace(/\r\n/g, '\n');
    assert.equal(
      createHash('sha256').update(source, 'utf8').digest('hex'),
      definition.source_fingerprint_sha256,
    );
  }
});

test('every registered pipeline fingerprint pins its exact normalized executable contract', async () => {
  const sourceByKey = new Map([
    ['PromoProof@ps-002-v1', '../work/promo-studio/ps-002/scripts/render-proof.mjs'],
    ['vertical-ui-story@v1', '../workers/promo-render-worker/pipeline.mjs'],
  ]);
  for (const definition of PROMO_COMPOSITIONS) {
    const source = (await read(sourceByKey.get(`${definition.key}@${definition.version}`))).replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(source, 'utf8').digest('hex'), definition.pipeline_fingerprint_sha256);
  }
});

test('composition is branch-neutral, deterministic, and data-driven', async () => {
  const [composition, types] = await Promise.all([
    read('../workers/clip-render-worker/remotion/PromoVerticalStory.tsx'),
    read('../workers/clip-render-worker/remotion/types.ts'),
  ]);
  assert.match(types, /scenes: PromoVerticalScene\[\]/);
  assert.match(types, /captions: PromoVerticalCaption\[\]/);
  assert.match(types, /voice_source\?: string/);
  assert.match(types, /music_source\?: string/);
  assert.match(types, /brand: \{/);
  assert.match(types, /safe_area: \{/);
  assert.match(types, /review\?: \{ overlay\?: string; provenance_label\?: string \}/);
  assert.match(composition, /<Img /);
  assert.match(composition, /<Video /);
  assert.match(composition, /<Audio /);
  assert.match(composition, /useCurrentFrame\(\)/);
  assert.match(composition, /spring\(/);
  assert.doesNotMatch(composition, /Rekkrd|Stakkd|signal chain|listening room|\/preview\?/i);
  assert.doesNotMatch(composition, /Math\.random|Date\.now|setTimeout|setInterval|transition:/);
});

test('sample renderer uses the real PS-002 fixture and pinned delivery pipeline', async () => {
  const [script, pipeline] = await Promise.all([
    read('../work/promo-studio/vertical-ui-story-v1/scripts/render-sample.mjs'),
    read('../workers/promo-render-worker/pipeline.mjs'),
  ]);
  assert.match(script, /id: 'vertical-ui-story'/);
  assert.match(script, /proof\.capture\.file/);
  assert.match(script, /proof\.voice\.file/);
  assert.match(script, /proof\.music\.file/);
  assert.match(script, /proof\.end_card\.logo_file/);
  assert.match(script, /buildFinalizeArgs/);
  assert.match(script, /buildCorrectionArgs/);
  assert.match(pipeline, /loudnorm=I=-14:TP=-1\.5/);
  assert.match(pipeline, /libx264/);
  assert.match(pipeline, /yuv420p/);
  assert.match(script, /validateProbe/);
  assert.match(script, /validateLoudness/);
});

test('delivery pipeline exposes bounded argument arrays rather than caller-supplied flags', () => {
  const measurement = { input_i: '-20', input_tp: '-3', input_lra: '2', input_thresh: '-30', target_offset: '0.1' };
  const finalize = buildFinalizeArgs({ inputPath: 'input.mp4', outputPath: 'normalized.mp4', targetSeconds: 10, measurement });
  assert.deepEqual(finalize.slice(-6), ['-ar', '48000', '-b:a', '192k', '-movflags', '+faststart', 'normalized.mp4'].slice(-6));
  assert.equal(finalize.includes('libx264'), true);
  assert.equal(finalize.includes('yuv420p'), true);
  assert.equal(finalize.includes('tv'), true);
  assert.equal(buildCorrectionArgs({
    inputPath: 'normalized.mp4', outputPath: 'final.mp4', targetSeconds: 10, measuredIntegratedLufs: -14.1,
  }).includes('volume=0.100dB,alimiter=limit=0.79:level=false'), true);
  assert.deepEqual(buildProbeArgs('final.mp4'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'final.mp4']);
  assert.equal(buildLoudnessAnalysisArgs('final.mp4', 'NUL').includes('loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json'), true);
  assert.throws(() => buildFinalizeArgs({ inputPath: 'in', outputPath: 'out', targetSeconds: 0.5, measurement }), /between 1 and 600/i);
  assert.throws(() => buildCorrectionArgs({ inputPath: 'in', outputPath: 'out', targetSeconds: 10, measuredIntegratedLufs: -30 }), /3 dB safety bound/i);
});

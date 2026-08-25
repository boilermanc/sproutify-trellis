import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PROMO_COMPOSITIONS } from '../supabase/functions/_shared/promo-compositions.ts';

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
  assert.match(registry, /key: "vertical-ui-story"[\s\S]*worker_enabled: false/);
  const definition = PROMO_COMPOSITIONS.find(item => item.key === 'vertical-ui-story' && item.version === 'v1');
  assert.equal(definition?.status, 'render_verified');
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

test('sample renderer uses the real PS-002 fixture and delivery QA', async () => {
  const script = await read('../work/promo-studio/vertical-ui-story-v1/scripts/render-sample.mjs');
  assert.match(script, /id: 'vertical-ui-story'/);
  assert.match(script, /proof\.capture\.file/);
  assert.match(script, /proof\.voice\.file/);
  assert.match(script, /proof\.music\.file/);
  assert.match(script, /proof\.end_card\.logo_file/);
  assert.match(script, /loudnorm=I=-14:TP=-1\.5/);
  assert.match(script, /libx264/);
  assert.match(script, /yuv420p/);
  assert.match(script, /validateProbe/);
  assert.match(script, /validateLoudness/);
});

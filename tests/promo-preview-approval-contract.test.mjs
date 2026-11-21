import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('preview selection accepts only a ready vertical asset produced by a succeeded preview job', async () => {
  const edge = await read('../supabase/functions/promo-studio/index.ts');
  assert.match(edge, /action === "select_preview"/);
  assert.match(edge, /\.eq\("kind", "render_preview"\)\.eq\("status", "ready"\)/);
  assert.match(edge, /asset\.width !== 1080 \|\| asset\.height !== 1920/);
  assert.match(edge, /\.eq\("job_type", "preview_render"\)\.eq\("status", "succeeded"\)\.contains\("output_asset_ids", \[asset\.id\]\)/);
  assert.match(edge, /selected_preview_render_id: asset\.id, status: "final_review"/);
  assert.match(edge, /current_revision_id: revisionId, status: manifest\.promo\.status,[\s\S]{0,120}selected_preview_render_id: null, final_approved_at: null/);
});

test('preview decisions are bound server-side to the selected current-revision asset', async () => {
  const [edge, service] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../services/promoStudioService.ts'),
  ]);
  assert.match(edge, /action === "review_preview"/);
  assert.match(edge, /subject_type: "asset",\s*subject_id: asset\.id, decision/);
  assert.match(edge, /if \(gate === "preview"\) throw new Error\("Preview decisions must use the selected preview review action\."\)/);
  assert.match(service, /selectPromoPreview\(projectId: string, assetId: string\)/);
  assert.match(service, /reviewPromoPreview\(/);
  assert.doesNotMatch(service, /reviewPromoPreview[\s\S]{0,300}subject_id/);
});

test('final render readiness uses the selected preview asset and its latest matching decision', async () => {
  const [render, workerBoundary] = await Promise.all([
    read('../supabase/functions/_shared/promo-render.ts'), read('../workers/promo-render-worker/README.md'),
  ]);
  assert.match(render, /approval\.subject_type === "asset" && approval\.subject_id === selectedPreviewAssetId/);
  assert.match(render, /selectedPreviewAsset\.kind !== "render_preview"/);
  assert.match(render, /latestPreviewDecision\?\.decision !== "approved"/);
  assert.match(render, /approved_preview_asset_id: jobType === "final_render" \? selectedPreviewAssetId : null/);
  assert.match(workerBoundary, /post-claim preflight/i);
  assert.match(workerBoundary, /cannot outlive a revoke/i);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { applyPromoCaptureAdoption } from '../supabase/functions/_shared/promo-capture.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const ids = {
  run: '30000000-0000-4000-8000-000000000001',
  job: '30000000-0000-4000-8000-000000000002',
  scenarioRow: '30000000-0000-4000-8000-000000000003',
  video: '30000000-0000-4000-8000-000000000004',
  still: '30000000-0000-4000-8000-000000000005',
  trace: '30000000-0000-4000-8000-000000000006',
};

async function fixture() {
  const manifest = JSON.parse(await read('../features/promo-studio/schemas/fixtures/rekkrd.manifest.v1.json'));
  const scenario = manifest.captures.scenarios[0];
  scenario.status = 'draft';
  scenario.artifact_asset_ids = [];
  scenario.assertions = scenario.assertions.map(assertion => ({ ...assertion, passed: false }));
  manifest.assets = manifest.assets.filter(asset => asset.provenance?.source_kind !== 'real_ui_capture');
  for (const scene of manifest.scenes) {
    if (scene.visual?.capture_scenario_id === scenario.id) scene.visual.asset_id = null;
  }
  const scenarioRow = {
    id: ids.scenarioRow, project_id: manifest.promo.id, revision_id: manifest.promo.revision_id,
    scenario_key: scenario.key, scenario_version: scenario.version, repository_ref: scenario.repository_ref,
    commit_sha: scenario.commit_sha, route: scenario.route, status: 'verified', definition: structuredClone(scenario),
  };
  const evidence = {
    schema_version: '1.0.0', scenario_id: scenario.id, scenario_key: scenario.key,
    scenario_version: scenario.version, commit_sha: scenario.commit_sha, route: scenario.route,
    contains_pii: false, masks_applied: structuredClone(scenario.masks),
    assertions: scenario.assertions.map(assertion => ({ ...assertion, passed: true })),
  };
  const run = {
    id: ids.run, job_id: ids.job, project_id: manifest.promo.id, revision_id: manifest.promo.revision_id,
    scenario_id: scenarioRow.id, status: 'succeeded', video_asset_id: ids.video,
    still_asset_ids: [ids.still], trace_asset_id: ids.trace, evidence,
  };
  const base = {
    project_id: manifest.promo.id, revision_id: manifest.promo.revision_id, status: 'ready',
    storage_bucket: 'promo-assets', file_size_bytes: 128, checksum_sha256: 'a'.repeat(64),
  };
  const assets = [
    { ...base, id: ids.video, kind: 'capture_video', role: scenario.key, storage_path: 'capture/video.mp4', mime_type: 'video/mp4', duration_seconds: 10, width: 1080, height: 1920 },
    { ...base, id: ids.still, kind: 'capture_still', role: scenario.key, storage_path: 'capture/still.png', mime_type: 'image/png', width: 1080, height: 1920 },
    { ...base, id: ids.trace, kind: 'capture_trace', role: scenario.key, storage_path: 'capture/trace.json', mime_type: 'application/json' },
  ];
  return { manifest, scenario, scenarioRow, run, assets };
}

test('adoption creates a verified manifest candidate without mutating its parent', async () => {
  const value = await fixture();
  const original = structuredClone(value.manifest);
  const adopted = applyPromoCaptureAdoption(value.manifest, value.scenarioRow, value.run, value.assets);
  assert.deepEqual(value.manifest, original);
  const scenario = adopted.captures.scenarios[0];
  assert.equal(scenario.status, 'verified');
  assert.equal(scenario.assertions.every(assertion => assertion.passed), true);
  assert.deepEqual(scenario.artifact_asset_ids, [ids.video, ids.still, ids.trace]);
  assert.equal(adopted.scenes.find(scene => scene.visual?.capture_scenario_id === scenario.id).visual.asset_id, ids.video);
  assert.deepEqual(adopted.assets.slice(-3).map(asset => asset.id), [ids.video, ids.still, ids.trace]);
  assert.equal(adopted.assets.slice(-3).every(asset => asset.provenance.source_kind === 'real_ui_capture'
    && asset.provenance.generated === false && asset.provenance.approved === false), true);
  assert.equal(adopted.run_lineage.job_ids.includes(ids.job), true);
  assert.equal(adopted.run_lineage.output_checksums.includes('a'.repeat(64)), true);
});

test('adoption rejects stale evidence, PII, and incomplete or misclassified artifacts', async () => {
  const stale = await fixture();
  stale.scenarioRow.commit_sha = 'f'.repeat(40);
  assert.throws(() => applyPromoCaptureAdoption(stale.manifest, stale.scenarioRow, stale.run, stale.assets),
    error => error.code === 'PROMO_CAPTURE_ADOPTION_SCENARIO_STALE');

  const pii = await fixture();
  pii.run.evidence.contains_pii = true;
  assert.throws(() => applyPromoCaptureAdoption(pii.manifest, pii.scenarioRow, pii.run, pii.assets),
    error => error.code === 'PROMO_CAPTURE_ADOPTION_EVIDENCE_INVALID');

  const failedDuplicate = await fixture();
  failedDuplicate.run.evidence.assertions.push({
    ...failedDuplicate.run.evidence.assertions[0], passed: false,
  });
  assert.throws(() => applyPromoCaptureAdoption(
    failedDuplicate.manifest, failedDuplicate.scenarioRow, failedDuplicate.run, failedDuplicate.assets,
  ), error => error.code === 'PROMO_CAPTURE_ADOPTION_RUN_INVALID');

  const missingLineage = await fixture();
  missingLineage.run.job_id = null;
  assert.throws(() => applyPromoCaptureAdoption(missingLineage.manifest, missingLineage.scenarioRow, missingLineage.run, missingLineage.assets),
    error => error.code === 'PROMO_CAPTURE_ADOPTION_RUN_INVALID');

  const missing = await fixture();
  missing.assets.pop();
  assert.throws(() => applyPromoCaptureAdoption(missing.manifest, missing.scenarioRow, missing.run, missing.assets),
    error => error.code === 'PROMO_CAPTURE_ADOPTION_ASSET_INVALID');

  const wrongKind = await fixture();
  wrongKind.assets[0].kind = 'generated_image';
  assert.throws(() => applyPromoCaptureAdoption(wrongKind.manifest, wrongKind.scenarioRow, wrongKind.run, wrongKind.assets),
    error => error.code === 'PROMO_CAPTURE_ADOPTION_ASSET_INVALID');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { planPromoPreviewWorkflow } from '../features/promo-studio/guidedWorkflow.ts';

const revisionId = 'revision-current';
const base = () => ({
  project: { selected_preview_render_id: null },
  source: { id: 'source-1', capture_base_url: 'https://preview.example', capture_fixture_key: 'approved-fixture' },
  revision: { id: revisionId, manifest: {
    evidence: { repository: { full_name: 'boilermanc/lanewise' }, claims: [{ id: 'claim-1', status: 'verified', approved: true }] },
    script: { status: 'approved' }, captures: { scenarios: [] },
    voice: { selected_take_id: 'voice-1', takes: [{ id: 'voice-1', status: 'ready' }] },
    music: { selected_take_id: 'music-1', takes: [{ id: 'music-1', status: 'ready' }] },
  } },
  jobs: [], capture_runs: [], voice_takes: [], music_takes: [], assets: [], approvals: [],
});

test('guided workflow starts with evidence planning and preserves content review gates', () => {
  const detail = base();
  detail.revision.manifest.evidence.repository = null;
  assert.equal(planPromoPreviewWorkflow(detail).action, 'generate_plan');
  detail.revision.manifest.evidence.repository = { full_name: 'boilermanc/lanewise' };
  detail.revision.manifest.evidence.claims[0].approved = false;
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'review_claims');
  detail.revision.manifest.evidence.claims[0].approved = true;
  detail.revision.manifest.script.status = 'review';
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'review_script');
});

test('guided workflow queues and technically adopts each capture before audio', () => {
  const detail = base();
  detail.revision.manifest.captures.scenarios = [{ id: 'scenario-1', key: 'lanewise.home', route: '/', status: 'draft' }];
  let step = planPromoPreviewWorkflow(detail);
  assert.equal(step.action, 'queue_capture');
  assert.equal(step.target_id, 'scenario-1');
  detail.jobs.push({ id: 'capture-job', revision_id: revisionId, job_type: 'capture', status: 'running', progress: 45, input: { scenario_id: 'scenario-1' } });
  step = planPromoPreviewWorkflow(detail);
  assert.equal(step.status, 'waiting');
  assert.equal(step.progress, 45);
  detail.jobs[0].status = 'succeeded';
  detail.capture_runs.push({ id: 'run-1', revision_id: revisionId, status: 'succeeded', evidence: { scenario_id: 'scenario-1' } });
  step = planPromoPreviewWorkflow(detail);
  assert.equal(step.action, 'adopt_capture');
  assert.equal(step.target_id, 'run-1');
});

test('guided workflow automates voice preparation but stops for listening approval', () => {
  const detail = base();
  detail.revision.manifest.voice = { selected_take_id: null, takes: [] };
  assert.equal(planPromoPreviewWorkflow(detail).action, 'queue_voice');
  detail.voice_takes.push({ id: 'voice-new', revision_id: revisionId, status: 'aligning' });
  assert.equal(planPromoPreviewWorkflow(detail).action, 'adopt_voice_master');
  detail.revision.manifest.voice.takes = [{ id: 'voice-new', status: 'aligning' }];
  assert.equal(planPromoPreviewWorkflow(detail).action, 'queue_alignment');
  detail.voice_takes[0].status = 'ready';
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'review_voice');
});

test('guided workflow stops for music approval then renders and selects a preview', () => {
  const detail = base();
  detail.revision.manifest.music = { selected_take_id: null, takes: [] };
  assert.equal(planPromoPreviewWorkflow(detail).action, 'queue_music');
  detail.music_takes.push({ id: 'music-new', revision_id: revisionId, status: 'ready' });
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'review_music');
  detail.revision.manifest.music = { selected_take_id: 'music-new', takes: [{ id: 'music-new', status: 'ready' }] };
  assert.equal(planPromoPreviewWorkflow(detail).action, 'queue_preview');
  detail.assets.push({ id: 'preview-1', revision_id: revisionId, kind: 'render_preview', status: 'ready' });
  assert.equal(planPromoPreviewWorkflow(detail).action, 'select_preview');
  detail.project.selected_preview_render_id = 'preview-1';
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'review_preview');
  detail.approvals.push({ revision_id: revisionId, gate: 'preview', subject_id: 'preview-1', decision: 'approved', created_at: '2026-09-03T12:00:00Z' });
  assert.equal(planPromoPreviewWorkflow(detail).gate, 'ready_for_final');
});

test('guided workflow never silently retries failed provider jobs', () => {
  const detail = base();
  detail.revision.manifest.voice = { selected_take_id: null, takes: [] };
  detail.jobs.push({ id: 'failed-voice', revision_id: revisionId, job_type: 'voice_generate', status: 'failed', error_message: 'Provider unavailable' });
  const step = planPromoPreviewWorkflow(detail);
  assert.equal(step.status, 'blocked');
  assert.equal(step.action, 'retry_job');
  assert.equal(step.job_id, 'failed-voice');
});

test('guided workflow remains branch-neutral', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../features/promo-studio/guidedWorkflow.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /rekkrd|lanewise|atlurbanfarms/i);
});

test('Promo Studio exposes one guided production action and keeps diagnostics advanced', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../pages/PromoStudio.tsx', import.meta.url), 'utf8');
  assert.match(source, /'Produce preview'/);
  assert.match(source, /planPromoPreviewWorkflow/);
  assert.match(source, /queuePromoCapture/);
  assert.match(source, /queuePromoRender/);
  assert.match(source, /signPromoAsset/);
  assert.match(source, /<audio controls/);
  assert.match(source, /<video controls/);
  assert.match(source, /Advanced/);
  assert.doesNotMatch(source, /rekkrd|lanewise|atlurbanfarms/i);
});

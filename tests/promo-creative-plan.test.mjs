import assert from 'node:assert/strict';
import test from 'node:test';

import { createDraftPromoManifest } from '../supabase/functions/_shared/promo-studio.ts';
import { materializePromoCreativePlan, parsePromoCreativePlan } from '../supabase/functions/_shared/promo-creative-plan.ts';
import { parsePromoManifest } from '../features/promo-studio/schemas/promoManifest.ts';

const evidence = {
  repository: 'boilermanc/rekkrd', commit_sha: 'a'.repeat(40), framework: 'React/Vite', permitted_paths: ['src'],
  scanned_files: [], skipped: [], assets: [{ path: 'public/rekkrd-icon.png', kind: 'brand_asset_candidate' }],
  routes: [{ id: 'preview', path: '/preview', label: 'Preview', evidence: [{ path: 'src/App.tsx', lines: [10, 10] }], capture_readiness: 'candidate' }],
  test_selectors: [{ selector: '[data-testid="stakkd-screen"]', evidence: { path: 'src/components/StakkdScreen.tsx', line: 12 } }],
  feature_modules: [{ id: 'stakkd-screen', name: 'StakkdScreen', evidence: [{ path: 'src/components/StakkdScreen.tsx', symbol: 'StakkdScreen' }] }],
};

const source = {
  default_ref: 'main', permitted_paths: ['src', 'public'], prohibited_paths: [], capture_base_url: null,
  capture_fixture_key: null, capture_auth_profile_key: null,
};

const plan = {
  schema_version: '1.0.0',
  normalized_brief: { goal: 'feature', audience: 'Audio collectors', offer: 'Show the verified Stakkd screen', cta: '', tone: 'Warm and precise', required_feature_ids: ['stakkd-screen'], constraints: ['Use only verified product evidence'] },
  claims: [{ id: 'claim-stakkd', text: 'Rekkrd includes a Stakkd screen.', claim_type: 'product_feature', evidence_refs: ['feature:stakkd-screen'] }],
  script: { full_text: 'See your system in Stakkd.', pronunciations: { Stakkd: 'stacked' }, phrases: [{ id: 'phrase-stakkd', display_text: 'See your system in Stakkd.', speech_text: 'See your system in stacked.', evidence_refs: ['feature:stakkd-screen'], emphasis: 'light', delivery_note: 'Warm and conversational' }] },
  storyboard: [{ id: 'scene-stakkd', name: 'Stakkd reveal', purpose: 'Show the verified product component', phrase_id: 'phrase-stakkd', claim_ids: ['claim-stakkd'], visual_kind: 'real_ui_capture', route_id: 'preview', asset_path: null, generated_visual_disclosed: false, duration: { mode: 'flex', min_seconds: 2, preferred_seconds: 4, max_seconds: 6 } }],
  capture_plan: [{ id: 'stakkd-preview', route_id: 'preview', purpose: 'Capture the verified Stakkd component', selectors: ['[data-testid="stakkd-screen"]'], assertions: ['Stakkd screen is visible'], masks: [] }],
  music_brief: { instrumental: true, mood: 'Warm modern analog', tempo_min_bpm: 88, tempo_max_bpm: 104, instrumentation: ['restrained synth pulse'], energy_arc: [{ phrase_id: 'phrase-stakkd', direction: 'Lift gently at the reveal' }], accent_phrase_ids: ['phrase-stakkd'], ending: 'Clean resolved ending', avoid: ['vocals'] },
};

function draft() {
  return createDraftPromoManifest({
    projectId: '10000000-0000-0000-0000-000000000001', revisionId: '20000000-0000-0000-0000-000000000001',
    ownerId: '30000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001',
    branch: { id: '40000000-0000-0000-0000-000000000001', slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Rekkrd plan', prompt: 'Show Stakkd.', targetSeconds: 10, formats: ['9:16'], now: '2026-08-25T12:00:00.000Z',
  });
}

test('strict planning output materializes as a review-only valid draft manifest', () => {
  const parsed = parsePromoCreativePlan(plan, evidence);
  const manifest = parsePromoManifest(materializePromoCreativePlan(draft(), parsed, evidence, source), { gate: 'draft' });
  assert.equal(manifest.promo.status, 'script_review');
  assert.equal(manifest.script.status, 'review');
  assert.equal(manifest.evidence.claims[0].status, 'verified');
  assert.equal(manifest.evidence.claims[0].approved, false);
  assert.equal(manifest.captures.scenarios[0].status, 'draft');
  assert.ok(manifest.captures.scenarios[0].assertions.every(item => item.passed === false));
  assert.equal(manifest.run_lineage.job_ids.length, 0);
});

test('raw model output cannot add actions, jobs, providers, or publishing instructions', () => {
  for (const field of ['action', 'jobs', 'providers', 'publish']) {
    assert.throws(() => parsePromoCreativePlan({ ...plan, [field]: {} }, evidence), /Unrecognized key/i);
  }
});

test('unknown routes, selectors, phrase anchors, and generated-visual disclosures fail closed', () => {
  assert.throws(() => parsePromoCreativePlan({ ...plan, capture_plan: [{ ...plan.capture_plan[0], selectors: ['#invented'] }] }, evidence), /selector/i);
  assert.throws(() => parsePromoCreativePlan({ ...plan, storyboard: [{ ...plan.storyboard[0], route_id: 'invented' }] }, evidence), /route/i);
  assert.throws(() => parsePromoCreativePlan({ ...plan, storyboard: [{ ...plan.storyboard[0], phrase_id: 'invented' }] }, evidence), /phrase/i);
  assert.throws(() => parsePromoCreativePlan({ ...plan, storyboard: [{ ...plan.storyboard[0], visual_kind: 'generated_visual', route_id: null }] }, evidence), /disclose/i);
});

test('claims with unknown evidence remain unsupported and unapproved for strict review', () => {
  const candidate = structuredClone(plan);
  candidate.claims[0].evidence_refs = ['feature:not-real'];
  const manifest = materializePromoCreativePlan(draft(), parsePromoCreativePlan(candidate, evidence), evidence, source);
  assert.equal(manifest.evidence.claims[0].status, 'unsupported');
  assert.equal(manifest.evidence.claims[0].approved, false);
});

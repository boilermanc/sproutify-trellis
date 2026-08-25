import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyPromoClaimApproval, applyPromoScriptApproval, assertPromoApprovalStatePreserved, createDraftPromoManifest,
} from '../supabase/functions/_shared/promo-studio.ts';
import { parsePromoManifest } from '../features/promo-studio/schemas/promoManifest.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function reviewManifest(status = 'verified') {
  const manifest = createDraftPromoManifest({
    projectId: '10000000-0000-0000-0000-000000000001', revisionId: '20000000-0000-0000-0000-000000000001',
    ownerId: '30000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001',
    branch: { id: '40000000-0000-0000-0000-000000000001', slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Approval test', prompt: 'Show verified UI.', targetSeconds: 10, formats: ['9:16'], now: '2026-08-25T12:00:00.000Z',
  });
  manifest.promo.status = 'script_review';
  manifest.evidence.claims = [{
    id: 'claim-ui', text: 'The verified UI is shown.', claim_type: 'product_feature',
    status, evidence_refs: ['feature:verified-ui'], approved: false,
  }];
  manifest.script = {
    status: 'review', approved_text: 'See the verified UI.', source_refs: ['feature:verified-ui'], pronunciations: {},
    phrases: [{ id: 'phrase-ui', display_text: 'See the verified UI.', speech_text: 'See the verified UI.', evidence_refs: ['feature:verified-ui'], emphasis: 'light' }],
    segments: [{ id: 'segment-ui', phrase_ids: ['phrase-ui'], delivery_note: 'Clear' }],
  };
  return manifest;
}

test('only evidenced claims can be approved and approval is revision data', () => {
  const approved = parsePromoManifest(applyPromoClaimApproval(reviewManifest(), 'claim-ui'));
  assert.equal(approved.evidence.claims[0].approved, true);
  assert.deepEqual(approved.safety.claim_approval_ids, ['claim-ui']);
  assert.equal(approved.script.status, 'review');
  assert.throws(() => applyPromoClaimApproval(reviewManifest('unsupported'), 'claim-ui'), /verified or user-attested/i);
  assert.throws(() => applyPromoClaimApproval(reviewManifest(), 'not-real'), /does not belong/i);
  assert.throws(() => applyPromoClaimApproval(approved, 'claim-ui'), /already approved/i);
});

test('script approval requires every claim and advances only to audio review', () => {
  assert.throws(() => applyPromoScriptApproval(reviewManifest()), /Every claim must be verified and approved/i);
  const manifest = applyPromoScriptApproval(applyPromoClaimApproval(reviewManifest(), 'claim-ui'));
  assert.equal(manifest.script.status, 'approved');
  assert.equal(manifest.promo.status, 'audio_review');
  assert.equal(manifest.run_lineage.job_ids.length, 0);
  assert.throws(() => applyPromoScriptApproval(manifest), /already approved/i);
});

test('generic revision edits cannot bypass approval gates', () => {
  const current = reviewManifest();
  const claimBypass = structuredClone(current);
  claimBypass.evidence.claims[0].approved = true;
  assert.throws(() => assertPromoApprovalStatePreserved(current, claimBypass), /claim approval gate/i);
  const idBypass = structuredClone(current);
  idBypass.safety.claim_approval_ids.push('claim-ui');
  assert.throws(() => assertPromoApprovalStatePreserved(current, idBypass), /approval IDs/i);
  const scriptBypass = structuredClone(current);
  scriptBypass.script.status = 'approved';
  assert.throws(() => assertPromoApprovalStatePreserved(current, scriptBypass), /script approval gate/i);
  const normalEdit = structuredClone(current);
  normalEdit.script.phrases[0].speech_text = 'See the verified user interface.';
  assert.doesNotThrow(() => assertPromoApprovalStatePreserved(current, normalEdit));
});

test('claim gate migration is additive and included in the Schema Engine stamp', async () => {
  const [migration, constants, edge] = await Promise.all([
    read('../supabase/migrations/20260825191617_add_promo_claim_approval_gate.sql'),
    read('../constants.ts'), read('../supabase/functions/promo-studio/index.ts'),
  ]);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS promo_approvals_gate_check/);
  assert.match(migration, /'claims','script'/);
  assert.match(constants, /PROMO_CLAIM_APPROVAL_GATE_SQL_SCHEMA/);
  assert.match(edge, /action === "approve_claim" \|\| action === "approve_script"/);
  assert.match(edge, /eq\("current_revision_id", input\.current\.id\)/);
  assert.match(edge, /persistPromoReviewProjection/);
});

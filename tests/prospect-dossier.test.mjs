import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/prospecting/ProspectDossier.tsx', import.meta.url), 'utf8');

test('dossier labels generated sales conclusions as advisory drafts', () => {
  assert.match(source, /Sales interpretation · advisory/);
  assert.match(source, /Draft · not approved/);
  assert.match(source, /Nothing here is sent automatically/);
});

test('dossier gates pitch-ready behind reviewed evidence and outreach approval', () => {
  assert.match(source, /record\.verification_state === 'outreach_approved'/);
  assert.match(source, /claims\.every\(claim => claim\.verification_decision !== 'pending'\)/);
  assert.match(source, /disabled=\{busy \|\| !canRequestPitchReady\}/);
});

test('dossier provides explicit founder review controls', () => {
  assert.match(source, /onReviewClaim\(claim\.id, 'approved'\)/);
  assert.match(source, /onReviewClaim\(claim\.id, 'corrected'/);
  assert.match(source, /onReviewClaim\(claim\.id, 'rejected'\)/);
  assert.match(source, /onReviewCandidate\('approved'\)/);
  assert.match(source, /onReviewCandidate\('rejected'\)/);
});

test('territory intelligence requires citations or displays an uncertainty warning', () => {
  assert.match(source, /Territory market intelligence/);
  assert.match(source, /Hypotheses must be verified/);
  assert.match(source, /No citation attached\. Treat this only as an unverified prompt/);
});

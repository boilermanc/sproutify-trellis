import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftPromoManifest,
  fingerprintPromoJson,
  sanitizePromoText,
  validatePromoCreate,
  validatePromoRevision,
} from '../supabase/functions/_shared/promo-studio.ts';
import { parsePromoManifest } from '../features/promo-studio/schemas/promoManifest.ts';

const ids = {
  project: '10000000-0000-0000-0000-000000000001',
  revision: '20000000-0000-0000-0000-000000000001',
  owner: '30000000-0000-0000-0000-000000000001',
  branch: '40000000-0000-0000-0000-000000000001',
  organization: '00000000-0000-0000-0000-000000000001',
};

function draft() {
  return createDraftPromoManifest({
    projectId: ids.project,
    revisionId: ids.revision,
    ownerId: ids.owner,
    organizationId: ids.organization,
    branch: { id: ids.branch, slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Rekkrd vertical proof',
    prompt: 'Show real product evidence.',
    targetSeconds: 10,
    formats: ['9:16'],
    now: '2026-08-25T12:00:00.000Z',
  });
}

test('Edge draft factory produces a canonical draft-gate manifest', () => {
  const parsed = parsePromoManifest(draft(), { gate: 'draft' });
  assert.equal(parsed.promo.status, 'draft');
  assert.equal(parsed.evidence.repository, null);
  assert.deepEqual(parsed.scenes, []);
});

test('create validation sanitizes direct identifiers and preserves supported formats', () => {
  const input = validatePromoCreate({
    title: 'Launch', prompt: 'Call 404-555-1212 and email someone@example.com',
    branch_id: ids.branch, target_seconds: 10, formats: ['9:16', '9:16', '1:1'],
  });
  assert.equal(input.prompt, 'Call [PHONE] and email [EMAIL]');
  assert.deepEqual(input.formats, ['9:16', '1:1']);
});

test('revision validation binds identity and blocks unsupported formats', () => {
  assert.equal(validatePromoRevision(draft(), ids.project, ids.revision, 1).promo.id, ids.project);
  const invalid = structuredClone(draft());
  invalid.promo.formats = ['4:5'];
  assert.throws(() => validatePromoRevision(invalid, ids.project, ids.revision, 1), /unsupported format/i);
});

test('server and client canonical fingerprints agree', async () => {
  const manifest = draft();
  assert.match(await fingerprintPromoJson(manifest), /^[a-f0-9]{64}$/);
  assert.equal(await fingerprintPromoJson(manifest), await fingerprintPromoJson(structuredClone(manifest)));
});

test('stored free text scrubs high-risk tokens', () => {
  assert.equal(sanitizePromoText('token_abcdefghijklmnopqrstuvwxyz123456'), '[SECRET]');
});

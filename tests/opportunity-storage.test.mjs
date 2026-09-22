import test from 'node:test';
import assert from 'node:assert/strict';
import { briefPermissions, buildSavedBrief, buildApprovedBrief, BriefError } from '../supabase/functions/opportunity-briefs/policy.mjs';
import { makeBrief, NOW, scope } from './fixtures/opportunity-brief.mjs';

const actorId = 'trusted-reviewer';
const operator = { id: 'operator-1', role: 'operator', status: 'active' };
const assignment = { trellis_user_id: operator.id, branch_id: 'branch-1', branch_role: 'member' };
const denied = { can_read: false, can_manage: false, can_approve: false };
function args(previous = null, input = makeBrief()) {
  let counter = 0;
  return { input, previous, scope: scope(input), actorId, now: NOW, newId: () => `server-id-${++counter}` };
}
function draft() { return buildSavedBrief(args()); }
function approval(previous = draft(), confirmedFactIds = previous.facts.map(f => f.id)) {
  return { ...args(previous, previous), confirmedFactIds };
}

test('inactive, missing, unassigned, wrong-actor and wrong-branch operators cannot read or write', () => {
  for (const [user, member] of [
    [null, null], [{ ...operator, status: 'suspended' }, assignment], [operator, null],
    [operator, { ...assignment, trellis_user_id: 'someone-else' }],
    [operator, { ...assignment, branch_id: 'other-branch' }],
  ]) assert.deepEqual(briefPermissions(user, member, 'branch-1'), denied);
});

test('member can save but only lead can approve; assigned viewer remains read-only', () => {
  assert.deepEqual(briefPermissions(operator, assignment, 'branch-1'), { can_read: true, can_manage: true, can_approve: false });
  assert.deepEqual(briefPermissions(operator, { ...assignment, branch_role: 'lead' }, 'branch-1'), { can_read: true, can_manage: true, can_approve: true });
  assert.deepEqual(briefPermissions({ ...operator, role: 'viewer' }, { ...assignment, branch_role: 'lead' }, 'branch-1'), { can_read: true, can_manage: false, can_approve: false });
});

test('active owner/admin have explicit global access; inactive admins do not', () => {
  for (const role of ['owner', 'admin']) {
    assert.deepEqual(briefPermissions({ ...operator, role }, null, 'branch-1'), { can_read: true, can_manage: true, can_approve: true });
    assert.deepEqual(briefPermissions({ ...operator, role, status: 'invited' }, null, 'branch-1'), denied);
  }
});

test('save ignores client identity, reviewer, version and approval metadata', () => {
  const input = makeBrief();
  const trustedScope = scope(input);
  Object.assign(input, { id: 'forged-id', version: 999, version_id: 'forged-version', author_id: 'forged-author', reviewer_id: 'forged-reviewer', brand_id: 'forged-brand', branch_id: 'forged-branch', project_id: 'forged-project' });
  const result = buildSavedBrief({ ...args(null, input), scope: trustedScope });
  assert.equal(result.id, 'server-id-1');
  assert.equal(result.version_id, 'server-id-2');
  assert.equal(result.version, 1);
  assert.equal(result.author_id, actorId);
  assert.equal(result.status, 'draft');
  assert.equal(result.reviewer_id, null);
  assert.equal(result.approved_at, null);
  assert.equal(result.facts[0].status, 'proposed');
  for (const key of Object.keys(trustedScope)) assert.equal(result[key], trustedScope[key]);
});

test('save rejects an existing brief from another trusted scope', () => {
  const previous = makeBrief();
  for (const key of ['brand_id', 'branch_id', 'project_id']) {
    assert.throws(() => buildSavedBrief({ ...args(previous), scope: { ...scope(previous), [key]: 'other' } }), error => error instanceof BriefError && error.status === 403);
  }
});

test('save creates an immutable successor and preserves only exact unchanged fact approval', () => {
  const previous = makeBrief();
  const original = structuredClone(previous);
  const next = buildSavedBrief(args(previous, structuredClone(previous)));
  assert.equal(next.id, previous.id);
  assert.notEqual(next.version_id, previous.version_id);
  assert.equal(next.version, previous.version + 1);
  assert.equal(next.supersedes_version_id, previous.version_id);
  assert.equal(next.facts[0].status, 'approved');
  assert.deepEqual(previous, original);
});

for (const edit of ['claim', 'evidence', 'review_due_at', 'offering_ids']) {
  test(`changed ${edit} cannot carry approval into a new draft`, () => {
    const previous = makeBrief();
    const input = structuredClone(previous);
    if (edit === 'evidence') input.facts[0].evidence[0].excerpt = 'New support';
    else if (edit === 'review_due_at') input.facts[0].review_due_at = '2027-01-01T12:00:00Z';
    else if (edit === 'offering_ids') input.facts[0].offering_ids = [];
    else input.facts[0].claim = 'A changed claim';
    const next = buildSavedBrief(args(previous, input));
    assert.equal(next.facts[0].status, 'proposed');
    assert.equal(next.facts[0].reviewer_id, null);
    assert.equal(next.facts[0].approved_at, null);
  });
}

test('withdrawals retain provenance without becoming approved again', () => {
  for (const status of ['retired', 'revoked']) {
    const previous = makeBrief();
    const input = structuredClone(previous);
    input.facts[0].status = status;
    const next = buildSavedBrief(args(previous, input));
    assert.equal(next.facts[0].status, status);
    assert.throws(() => buildApprovedBrief(approval(next)), BriefError);
  }
});

test('new free text is sanitized without mutating caller data or truncating identifiers', () => {
  const input = makeBrief();
  input.facts[0].claim = 'SSN 123-45-6789';
  const original = structuredClone(input);
  const saved = buildSavedBrief(args(null, input));
  assert.ok(!saved.facts[0].claim.includes('123-45-6789'));
  assert.equal(saved.facts[0].evidence[0].source_url, input.facts[0].evidence[0].source_url);
  assert.deepEqual(input, original);
});

test('approval stamps server actor/time and appends a new version without altering saved draft', () => {
  const previous = draft();
  const original = structuredClone(previous);
  const result = buildApprovedBrief(approval(previous));
  assert.equal(result.status, 'approved');
  assert.equal(result.reviewer_id, actorId);
  assert.equal(result.approved_at, NOW);
  assert.equal(result.version, previous.version + 1);
  assert.equal(result.supersedes_version_id, previous.version_id);
  assert.equal(result.facts[0].reviewer_id, actorId);
  assert.deepEqual(previous, original);
});

test('approval never silently approves unselected proposed facts', () => {
  const result = buildApprovedBrief(approval(draft(), []));
  assert.equal(result.status, 'approved');
  assert.equal(result.facts[0].status, 'proposed');
  assert.equal(result.facts[0].reviewer_id, null);
});

test('approval rejects missing/non-draft state and wrong-brand predecessor', () => {
  assert.throws(() => buildApprovedBrief({ ...approval(), previous: null }), BriefError);
  assert.throws(() => buildApprovedBrief(approval(makeBrief())), error => error.status === 409);
  const input = approval();
  input.scope.brand_id = 'another-brand';
  assert.throws(() => buildApprovedBrief(input), error => error.status === 403);
});

test('approval rejects unknown, duplicate and malformed fact selections', () => {
  const previous = draft();
  for (const ids of [['unknown'], [previous.facts[0].id, previous.facts[0].id], null, [1]]) {
    assert.throws(() => buildApprovedBrief(approval(previous, ids)), BriefError);
  }
});

test('expired facts cannot be approved even when the human selects them', () => {
  const previous = draft();
  previous.facts[0].review_due_at = NOW;
  assert.throws(() => buildApprovedBrief(approval(previous)), BriefError);
});

test('incomplete required context cannot be approved', () => {
  const previous = draft();
  previous.priorities = [];
  assert.throws(() => buildApprovedBrief(approval(previous)), error => error.code === 'not_ready');
});

test('malformed fact entries are rejected as input errors rather than internal failures', () => {
  for (const fact of [null, false, 'claim', []]) {
    const input = makeBrief();
    input.facts = [fact];
    assert.throws(() => buildSavedBrief(args(null, input)), error => error instanceof BriefError && error.status === 400);
  }
});

test('approval cannot predate the draft version being approved', () => {
  const previous = draft();
  assert.throws(() => buildApprovedBrief({ ...approval(previous), now: '2026-09-21T12:00:00Z' }), BriefError);
});

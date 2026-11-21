import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBriefReadiness, opportunityBriefSchema, validateBriefLineage } from '../services/opportunityBrief.mjs';

import { makeBrief as fixture, examples, NOW, CONFIRMED, scope } from './fixtures/opportunity-brief.mjs';
function evaluate(brief, options = {}) {
  return evaluateBriefReadiness(brief, { expectedScope: scope(brief), now: NOW, workflow: 'research', ...options });
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

for (const example of examples) {
  test(`${example.key}: one shared contract supports a distinct fictional business`, () => {
    const brief = fixture(example);
    assert.equal(opportunityBriefSchema.safeParse(brief).success, true);
    const result = evaluate(brief);
    assert.equal(result.ready, true);
    assert.equal(result.eligible_facts.length, 1);
    assert.equal(result.eligible_facts[0].claim, example.claim);
    assert.equal(result.brief.priorities[0].weight, null, 'missing owner weight must remain unset');
  });
}

test('existing free text is not silently converted into a complete approved brief', () => {
  const result = evaluateBriefReadiness({ brand_id: 'legacy', description: 'We are the best.' }, { expectedScope: { brand_id: 'legacy', branch_id: 'branch', project_id: 'project' }, now: NOW });
  assert.equal(result.ready, false);
  assert.deepEqual(result.eligible_facts, []);
});

for (const status of ['draft', 'review', 'retired']) {
  test(`${status} brief cannot become ready merely by containing approved facts`, () => {
    const brief = fixture();
    brief.status = status;
    const result = evaluate(brief);
    assert.equal(result.ready, false);
    assert.deepEqual(result.eligible_facts, []);
    assert.equal(brief.status, status);
  });
}

for (const field of ['reviewer_id', 'approved_at']) {
  test(`brief approval cannot be fabricated when ${field} is missing`, () => {
    const brief = fixture();
    brief[field] = null;
    assert.equal(evaluate(brief).ready, false);
  });
}

for (const field of ['brand_id', 'branch_id', 'project_id']) {
  test(`expected ${field} mismatch blocks all approved facts`, () => {
    const brief = fixture();
    const result = evaluate(brief, { expectedScope: { ...scope(brief), [field]: 'another-owner' } });
    assert.equal(result.ready, false);
    assert.deepEqual(result.eligible_facts, []);
  });
}

test('a second brand under the same branch and project still cannot consume the first brand facts', () => {
  const brief = fixture();
  assert.equal(evaluate(brief, { expectedScope: { ...scope(brief), brand_id: 'sibling-brand' } }).ready, false);
});

for (const collection of ['offerings', 'audiences', 'priorities', 'facts']) {
  test(`duplicate ${collection} IDs fail validation`, () => {
    const brief = fixture();
    brief[collection].push(structuredClone(brief[collection][0]));
    assert.equal(evaluate(brief).ready, false);
  });
}

for (const collection of ['audiences', 'facts']) {
  test(`${collection} cannot reference an offering outside the brief`, () => {
    const brief = fixture();
    brief[collection][0].offering_ids = ['other-brand-offering'];
    const result = evaluate(brief);
    assert.equal(result.ready, false);
    assert.deepEqual(result.eligible_facts, []);
  });
}

for (const status of ['proposed', 'revoked', 'retired']) {
  test(`${status} facts are never exposed as eligible claims`, () => {
    const brief = fixture();
    brief.facts[0].status = status;
    assert.deepEqual(evaluate(brief).eligible_facts, []);
  });
}

test('stale facts are excluded and a fresh fact is retained without deleting history', () => {
  const brief = fixture();
  const stale = structuredClone(brief.facts[0]);
  stale.id = 'stale-fact';
  stale.evidence[0].id = 'stale-evidence';
  stale.review_due_at = '2026-09-20T12:00:00Z';
  brief.facts.push(stale);
  const result = evaluate(brief);
  assert.deepEqual(result.eligible_facts.map(f => f.id), [brief.facts[0].id]);
  assert.equal(brief.facts.length, 2);
  assert.ok(result.issues.length > 0, 'staleness must remain visible');
});

test('review due at the exact evaluation instant is no longer fresh', () => {
  const brief = fixture();
  brief.facts[0].review_due_at = NOW;
  assert.deepEqual(evaluate(brief).eligible_facts, []);
});

for (const date of ['not-a-date', '2026-02-30T12:00:00Z', '2026-09-01']) {
  test(`invalid confirmation timestamp ${date} fails closed`, () => {
    const brief = fixture();
    brief.facts[0].last_confirmed_at = date;
    const result = evaluate(brief);
    assert.equal(result.ready, false);
    assert.deepEqual(result.eligible_facts, []);
  });
}

for (const field of ['last_confirmed_at', 'approved_at']) {
  test(`future fact ${field} is not an eligible claim`, () => {
    const brief = fixture();
    brief.facts[0][field] = '2026-09-25T12:00:00Z';
    assert.deepEqual(evaluate(brief).eligible_facts, []);
  });
}

test('future captured evidence cannot support an approved claim', () => {
  const brief = fixture();
  brief.facts[0].evidence[0].captured_at = '2026-09-25T12:00:00Z';
  assert.deepEqual(evaluate(brief).eligible_facts, []);
});

test('a source URL without an excerpt or record reference is not evidence support', () => {
  const brief = fixture();
  brief.facts[0].evidence[0].excerpt = null;
  brief.facts[0].evidence[0].record_reference = null;
  assert.deepEqual(evaluate(brief).eligible_facts, []);
});

test('approval metadata is not invented for a proposed fact', () => {
  const brief = fixture();
  brief.facts[0].status = 'proposed';
  brief.facts[0].reviewer_id = null;
  brief.facts[0].approved_at = null;
  const before = structuredClone(brief);
  const result = evaluate(brief);
  assert.deepEqual(result.eligible_facts, []);
  assert.deepEqual(brief, before);
});

for (const collection of ['offerings', 'audiences', 'priorities']) {
  test(`research is not ready without ${collection}`, () => {
    const brief = fixture();
    brief[collection] = [];
    // Remove dependent references to isolate the missing research context.
    if (collection === 'offerings') {
      brief.audiences[0].offering_ids = [];
      brief.facts[0].offering_ids = [];
    }
    assert.equal(evaluate(brief).ready, false);
  });
}

test('an expired priority does not count as an active business goal', () => {
  const brief = fixture();
  brief.priorities[0].starts_at = CONFIRMED;
  brief.priorities[0].ends_at = '2026-09-20T12:00:00Z';
  assert.equal(evaluate(brief).ready, false);
});

test('readiness does not mutate frozen input and outputs do not alias the input', () => {
  const brief = freezeDeep(fixture());
  const before = structuredClone(brief);
  const result = evaluate(brief);
  assert.equal(result.ready, true);
  assert.deepEqual(brief, before);
  result.eligible_facts[0].claim = 'Changed output only';
  assert.deepEqual(brief, before);
});

test('research may proceed without approved claims but drafting must wait', () => {
  const brief = fixture();
  brief.facts = [];
  assert.equal(evaluate(brief).ready, true);
  assert.equal(evaluate(brief, { workflow: 'drafting' }).ready, false);
});

test('a complete approved brief is ready for drafting', () => {
  assert.equal(evaluate(fixture(), { workflow: 'drafting' }).ready, true);
});

for (const missing of ['tone', 'allowed_channels', 'calls_to_action']) {
  test(`drafting requires ${missing} beyond research readiness`, () => {
    const brief = fixture();
    if (missing === 'tone') brief.voice.tone = '';
    else brief.content_context[missing] = [];
    assert.equal(evaluate(brief).ready, true);
    assert.equal(evaluate(brief, { workflow: 'drafting' }).ready, false);
  });
}

test('duplicate evidence IDs cannot ambiguously identify two fact sources', () => {
  const brief = fixture();
  const second = structuredClone(brief.facts[0]);
  second.id = 'different-fact';
  brief.facts.push(second);
  assert.equal(evaluate(brief).ready, false);
});

test('missing scope, missing time, and invalid time fail closed', () => {
  const brief = fixture();
  for (const options of [{ now: NOW }, { expectedScope: scope(brief) }, { expectedScope: scope(brief), now: 'invalid' }]) {
    const result = evaluateBriefReadiness(brief, options);
    assert.equal(result.ready, false);
    assert.deepEqual(result.eligible_facts, []);
  }
});

function revision(previous) {
  return { ...structuredClone(previous), version_id: 'new-version', version: previous.version + 1,
    supersedes_version_id: previous.version_id, status: 'draft', reviewer_id: null, approved_at: null,
    created_at: NOW, updated_at: NOW };
}

test('editing an approved version creates a new unapproved version without mutating history', () => {
  const previous = freezeDeep(fixture());
  const next = revision(previous);
  next.voice.tone = 'More concise';
  assert.equal(validateBriefLineage(previous, next).valid, true);
  assert.equal(previous.status, 'approved');
  assert.equal(previous.voice.tone, 'Friendly and factual');
  assert.equal(evaluate(next).ready, false);
});

for (const [field, value] of [
  ['id', 'different-brief'], ['brand_id', 'different-brand'], ['branch_id', 'different-branch'], ['project_id', 'different-project'],
  ['version', 3], ['version_id', 'nursery-v1'], ['supersedes_version_id', 'unknown-version'], ['status', 'approved'],
  ['created_at', '2026-08-01T12:00:00Z'], ['reviewer_id', 'carried-over-reviewer'], ['approved_at', CONFIRMED],
]) {
  test(`revision rejects invalid ${field}`, () => {
    const previous = fixture();
    const next = revision(previous);
    next[field] = value;
    assert.equal(validateBriefLineage(previous, next).valid, false);
  });
}

test('approved facts cannot claim approval newer than the approved brief snapshot', () => {
  const brief = fixture();
  brief.facts[0].approved_at = '2026-09-02T12:00:00Z';
  assert.equal(evaluate(brief).ready, false);
});

test('fact confirmation cannot postdate its brief snapshot', () => {
  const brief = fixture();
  brief.facts[0].last_confirmed_at = '2026-09-02T12:00:00Z';
  assert.equal(evaluate(brief).ready, false);
});

test('a changed fact must be proposed again rather than inheriting old approval', () => {
  const previous = fixture();
  const next = revision(previous);
  next.facts[0].claim = 'A different claim needing review.';
  assert.equal(validateBriefLineage(previous, next).valid, false);
  next.facts[0].status = 'proposed';
  next.facts[0].reviewer_id = null;
  next.facts[0].approved_at = null;
  assert.equal(validateBriefLineage(previous, next).valid, true);
});

test('new facts cannot arrive already approved through a draft revision', () => {
  const previous = fixture();
  const next = revision(previous);
  const added = structuredClone(next.facts[0]);
  added.id = 'new-fact';
  added.evidence[0].id = 'new-evidence';
  next.facts.push(added);
  assert.equal(validateBriefLineage(previous, next).valid, false);
  added.status = 'proposed';
  added.reviewer_id = null;
  added.approved_at = null;
  assert.equal(validateBriefLineage(previous, next).valid, true);
});

for (const status of ['revoked', 'retired']) {
  test(`a revision may mark an unchanged approved fact ${status} while preserving its audit history`, () => {
    const previous = freezeDeep(fixture());
    const next = revision(previous);
    next.facts[0].status = status;
    assert.equal(validateBriefLineage(previous, next).valid, true);
    assert.equal(next.facts[0].claim, previous.facts[0].claim);
    assert.deepEqual(next.facts[0].evidence, previous.facts[0].evidence);
    assert.equal(next.facts[0].reviewer_id, previous.facts[0].reviewer_id);
    assert.equal(next.facts[0].approved_at, previous.facts[0].approved_at);
    assert.equal(previous.facts[0].status, 'approved');

    // Simulate later human approval of the new brief, not restoration of its fact.
    next.status = 'approved';
    next.reviewer_id = 'fictional-next-reviewer';
    next.approved_at = NOW;
    const result = evaluate(next);
    assert.equal(result.ready, true);
    assert.deepEqual(result.eligible_facts, []);
    assert.equal(evaluate(next, { workflow: 'drafting' }).ready, false);
  });

  test(`${status} transition cannot disguise changed claim content under old approval`, () => {
    const previous = fixture();
    const next = revision(previous);
    next.facts[0].status = status;
    next.facts[0].claim = 'A different claim with no matching historical approval.';
    assert.equal(validateBriefLineage(previous, next).valid, false);
  });

  test(`${status} transition cannot rewrite historical evidence or reviewer attribution`, () => {
    const previous = fixture();
    for (const change of [
      fact => { fact.evidence[0].excerpt = 'Different evidence'; },
      fact => { fact.reviewer_id = 'different-reviewer'; },
    ]) {
      const next = revision(previous);
      next.facts[0].status = status;
      change(next.facts[0]);
      assert.equal(validateBriefLineage(previous, next).valid, false);
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { hasKnownCollectionCount, matchesCollectionFilter } from '../services/profileCollection.mjs';

function loadTs(path, modules = {}) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const context = { exports: {}, require: name => { if (!(name in modules)) throw Error(`Unexpected dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
  return context.exports;
}
const types = loadTs('segmentTypes.ts');
const { evaluateSegment } = loadTs('segmentEngine.ts', { './segmentTypes': types, './services/profileCollection.mjs': { hasKnownCollectionCount } });
const onboarding = types.PRESET_SEGMENTS.find(s => s.name === 'Rekkrd: No records yet');

test('collection filters distinguish confirmed zero, populated, and unavailable counts', () => {
  assert.equal(matchesCollectionFilter({ collection_record_count: 0 }, 'empty'), true);
  assert.equal(matchesCollectionFilter({ collection_record_count: 3 }, 'has_records'), true);
  assert.equal(matchesCollectionFilter({ collection_record_count: 3 }, 'empty'), false);
  for (const count of [undefined, null, NaN, -1, '0', 0.5]) {
    const profile = { collection_record_count: count };
    assert.equal(matchesCollectionFilter(profile, 'empty'), false);
    assert.equal(matchesCollectionFilter(profile, 'has_records'), false);
    assert.equal(matchesCollectionFilter(profile, 'unknown'), true);
    assert.equal(matchesCollectionFilter(profile, 'all'), true);
  }
});

test('campaign onboarding preset matches only confirmed empty Rekkrd collections', () => {
  assert.ok(onboarding);
  assert.ok(!onboarding.kind || onboarding.kind === 'rules', 'Must use ordinary campaign consent, never a test email list');
  const profile = { email: 'new@example.test', _spoke_name: 'Rekkrd', _spoke_id: 'rekkrd', collection_record_count: 0 };
  assert.equal(evaluateSegment(profile, onboarding), true);
  for (const count of [undefined, null, NaN, '0', -1, 1]) assert.equal(evaluateSegment({ ...profile, collection_record_count: count }, onboarding), false);
  assert.equal(evaluateSegment({ ...profile, _spoke_name: 'Another branch' }, onboarding), false);
});

test('collection numeric rules cannot coerce unavailable values into zero matches', () => {
  for (const operator of ['equals', 'not_equals', 'less_than', 'less_or_equal', 'greater_or_equal', 'between']) {
    const segment = { ...onboarding, rule_groups: [{ id: 'test', join: 'AND', rules: [{ field: 'collection_record_count', operator, value: 0, value2: 100 }] }] };
    assert.equal(evaluateSegment({ email: 'unknown@example.test' }, segment), false);
  }
});

test('the new preset is appended so previous campaign preset IDs remain unchanged', () => {
  const names = types.PRESET_SEGMENTS.map(s => s.name);
  assert.equal(names[0], 'VIP Customers');
  assert.equal(names[names.length - 2], 'Home App Leads');
  assert.equal(names[names.length - 1], 'Rekkrd: No records yet');
});

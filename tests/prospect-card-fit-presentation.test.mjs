import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../pages/Prospecting.tsx', import.meta.url), 'utf8');

test('prospect cards distinguish extreme, high, moderate, and low-priority fit', () => {
  assert.match(source, /Extreme fit/);
  assert.match(source, /High fit/);
  assert.match(source, /Moderate/);
  assert.match(source, /Low priority/);
  assert.match(source, /insufficient_evidence/);
});

test('prospect cards distinguish partial schedulers and full-stack incumbents', () => {
  assert.match(source, /Partial scheduler/);
  assert.match(source, /Full-stack incumbent/);
  assert.match(source, /Manual or limited stack/);
  assert.match(source, /currentStack/);
});

test('not-a-fit records are presented as disqualified without changing the stored enum', () => {
  assert.match(source, /not_a_fit: \{ label: 'Disqualified'/);
  assert.doesNotMatch(source, /const STAGES = \[[^\]]*'disqualified'/s);
});

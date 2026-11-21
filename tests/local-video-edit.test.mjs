import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../services/localVideoEdit.ts', import.meta.url), 'utf8');
const context = { exports: {}, MediaRecorder: { isTypeSupported: type => type === 'video/mp4' } };
vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
const { validateVideoEdit, mp4RecordingType } = context.exports;
test('trims require finite in-bounds ranges and a bounded duration', () => {
  const edit = { start: 2, end: 20, headline: '', audio: true };
  assert.equal(validateVideoEdit(edit, 27.8), null);
  for (const [start, end] of [[-1, 3], [5, 4], [0, 28], [0, NaN], [Infinity, 10], [0, .1]]) assert.ok(validateVideoEdit({ ...edit, start, end }, 27.8));
  assert.ok(validateVideoEdit({ ...edit, start: 0, end: 181 }, 200));
  assert.ok(validateVideoEdit(edit, Infinity));
});
test('MP4 capability selects only an actually supported format', () => {
  assert.equal(mp4RecordingType(), 'video/mp4');
  context.MediaRecorder.isTypeSupported = () => false;
  assert.equal(mp4RecordingType(), undefined);
});

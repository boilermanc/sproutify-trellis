import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manus = await readFile(new URL('../supabase/functions/manus/index.ts', import.meta.url), 'utf8');
const poller = await readFile(new URL('../supabase/functions/manus-poller/index.ts', import.meta.url), 'utf8');

test('verifies a newly created Manus task is readable before recording it', () => {
  assert.match(manus, /taskIsReadable\(taskId, key\)/);
  assert.match(manus, /Reconnect the Manus API key in Settings/);
});

test('fails inaccessible Manus tasks immediately instead of waiting for timeout', () => {
  assert.match(poller, /detail\.status === 404/);
  assert.match(poller, /task not found/i);
  assert.match(poller, /status: "failed"/);
  assert.match(poller, /Reconnect Manus in Settings/);
});

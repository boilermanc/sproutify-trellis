import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../pages/Transcriptions.tsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../services/transcriptionService.ts', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/transcriptions/index.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260915170335_transcription_studio.sql', import.meta.url), 'utf8');

test('Transcription Studio is private, owner-scoped, and supports timed exports', () => {
  assert.match(migration, /'transcription-audio', 'transcription-audio', false/);
  assert.match(migration, /auth\.uid\(\)\) = created_by/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(service, /'srt' \| 'vtt'/);
  assert.match(service, /audio_duration_secs/);
  assert.match(service, /'json'/);
  assert.match(page, /Identify speakers/);
});

test('transcription provider calls stay server-side and sanitize stored model output', () => {
  assert.doesNotMatch(service, /api\.openai\.com/);
  assert.match(edge, /api\.openai\.com\/v1\/audio\/transcriptions/);
  assert.match(edge, /timestamp_granularities\[\]/);
  assert.match(edge, /"word", "segment"/);
  assert.match(edge, /"whisper-1"/);
  assert.match(edge, /gpt-4o-transcribe-diarize/);
  assert.match(edge, /sanitizePII/);
});

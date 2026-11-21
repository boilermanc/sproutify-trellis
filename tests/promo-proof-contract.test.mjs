import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateLoudness, validateManifest, validateProbe } from '../work/promo-studio/ps-002/scripts/proof-contract.mjs';

const manifestPath = path.resolve('work/promo-studio/ps-002/manifest/proof-manifest.json');
const manifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('PS-002 blocks a final render without verified real capture provenance', () => {
  const value = manifest();
  value.capture = { ...value.capture, kind: 'blocked_placeholder', environment: null, commit_sha: null, checksum_sha256: null, assertions_passed: false };
  assert.throws(
    () => validateManifest(value),
    error => error.code === 'PS002_REAL_CAPTURE_REQUIRED',
  );
});

test('the Rekkrd Stakkd manifest carries complete real-capture provenance', () => {
  const value = validateManifest(manifest(), {
    assetDir: path.resolve('work/promo-studio/ps-002/assets'),
  });
  assert.equal(value.capture.kind, 'real_ui_capture');
  assert.equal(value.capture.scenario_key, 'rekkrd.stakkd.preview');
  assert.equal(value.capture.contains_pii, false);
  assert.match(value.capture.source_diff_sha256, /^[a-f0-9]{64}$/);
  assert.equal(value.voice.provider, 'google-gemini-tts');
  assert.equal(value.music.provider, 'google-lyria');
  assert.equal(value.end_card.logo_file, 'rekkrd-app-icon.png');
});

test('PS-002 keeps display spelling separate from TTS pronunciation guidance', () => {
  const value = manifest();
  assert.match(value.script.text, /Stakkd/);
  assert.match(value.script.speech_text, /Stacked/);
  assert.deepEqual(value.script.pronunciation_overrides, [{ display: 'Stakkd', spoken: 'Stacked' }]);
});

test('PS-002 rejects dirty source provenance without a diff checksum', () => {
  const value = manifest();
  value.capture.source_worktree_dirty = true;
  value.capture.source_diff_sha256 = null;
  assert.throws(
    () => validateManifest(value),
    error => error.code === 'PS002_CAPTURE_DIFF_MISSING',
  );
});

test('PS-002 permits the conspicuously labeled foundation render only with an explicit override', () => {
  const fixture = manifest();
  fixture.capture = { ...fixture.capture, kind: 'blocked_placeholder', file: 'capture-required.svg' };
  fixture.review_overlay = 'FOUNDATION ONLY — REAL UI CAPTURE REQUIRED';
  const value = validateManifest(fixture, {
    allowFoundationAssets: true,
    assetDir: path.resolve('work/promo-studio/ps-002/assets'),
  });
  assert.equal(value.capture.kind, 'blocked_placeholder');
  assert.match(value.review_overlay, /FOUNDATION ONLY/);
});

test('the proof contract is reusable across Trellis branches', () => {
  const value = manifest();
  value.proof_id = 'rejoice-vertical-proof';
  value.project = { branch_slug: 'rejoice', branch_id: null, display_name: 'Rejoice' };
  value.script = { text: 'Fixture copy', evidence_ids: ['rejoice-fixture-evidence'] };
  const validated = validateManifest(value, { allowFoundationAssets: true });
  assert.equal(validated.project.branch_slug, 'rejoice');
});

test('PS-002 rejects a capture that does not explicitly attest no PII', () => {
  const value = manifest();
  value.capture.contains_pii = null;
  assert.throws(
    () => validateManifest(value, { allowFoundationAssets: true }),
    error => error.code === 'PS002_PII_STATUS_INVALID',
  );
});

test('PS-002 accepts the required ffprobe delivery contract', () => {
  const result = validateProbe({
    streams: [
      { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1080, height: 1920, avg_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' },
    ],
    format: { duration: '10.000000' },
  });
  assert.deepEqual(result, { width: 1080, height: 1920, fps: 30, duration: 10, video: 'h264/yuv420p', audio: 'aac/48000' });
});

test('PS-002 rejects wrong dimensions even when codecs are valid', () => {
  assert.throws(
    () => validateProbe({
      streams: [
        { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1920, height: 1080, avg_frame_rate: '30/1' },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' },
      ],
      format: { duration: '10.0' },
    }),
    error => error.code === 'PS002_QA_DIMENSIONS',
  );
});

test('PS-002 enforces web/social loudness and true-peak limits', () => {
  assert.deepEqual(
    validateLoudness({ input_i: '-14.1', input_tp: '-1.0' }),
    { integrated_lufs: -14.1, true_peak_dbfs: -1 },
  );
  assert.throws(
    () => validateLoudness({ input_i: '-11.9', input_tp: '-0.9' }),
    error => error.code === 'PS002_QA_LOUDNESS',
  );
  assert.throws(
    () => validateLoudness({ input_i: '-14.0', input_tp: '-0.2' }),
    error => error.code === 'PS002_QA_TRUE_PEAK',
  );
});

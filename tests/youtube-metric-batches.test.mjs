import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n-blueprints/E9-youtube-analytics-sync.json', import.meta.url)));
const node = name => workflow.nodes.find(item => item.name === name);
const batch = rows => new Function('$input', node('Batch Metric Rows').parameters.jsCode)({ all: () => rows.map(json => ({ json })) });
const row = (index, extra = {}) => ({ youtube_video_id: `video-${index}`, metric_date: '2026-11-20', views: index, episode_id: 'episode', publication_id: 'pub', studio_album_id: null, studio_publication_id: null, ...extra });

for (const count of [0, 1, 499, 500, 501, 1001]) {
  test(`batches ${count} metrics without dropping or duplicating rows`, () => {
    const input = Array.from({ length: count }, (_, index) => row(index));
    const chunks = batch(input);
    assert.ok(chunks.every(chunk => chunk.json.rows.length > 0 && chunk.json.rows.length <= 500));
    assert.deepEqual(chunks.flatMap(chunk => chunk.json.rows), input);
    assert.equal(chunks.length, Math.ceil(count / 500));
  });
}

test('coalesces globally with first provenance and last metrics before chunking', () => {
  const rows = Array.from({ length: 501 }, (_, index) => row(index));
  rows.push(row(0, { views: 900 }), row(500, { views: 901 }));
  const output = batch(rows).flatMap(chunk => chunk.json.rows);
  assert.equal(output.length, 501);
  assert.equal(output.find(item => item.youtube_video_id === 'video-0').views, 900);
  assert.equal(output.find(item => item.youtube_video_id === 'video-500').views, 901);
});

test('keeps different dates and both publication shapes', () => {
  const rows = [row(1), row(1, { metric_date: '2026-11-19', episode_id: null, publication_id: null, studio_album_id: 'album', studio_publication_id: 'studio' })];
  assert.deepEqual(batch(rows)[0].json.rows, rows);
});

test('mixed-source duplicates keep the first complete source association while last metrics win', () => {
  const episode = row(1, { views: 10 });
  const studio = row(1, { views: 20, episode_id: null, publication_id: null, studio_album_id: 'album', studio_publication_id: 'studio' });
  for (const inputs of [[episode, studio], [studio, episode]]) {
    const output = batch(inputs)[0].json.rows;
    assert.equal(output.length, 1);
    for (const field of ['episode_id', 'publication_id', 'studio_album_id', 'studio_publication_id']) {
      assert.equal(output[0][field], inputs[0][field]);
    }
    assert.equal(output[0].views, inputs[1].views);
  }
});

test('rejects missing conflict keys before performing any upsert', () => {
  for (const invalid of [{ metric_date: '2026-11-20' }, { youtube_video_id: 'video' }, null]) {
    assert.throws(() => batch([invalid]), /require youtube_video_id and metric_date/);
  }
});

test('workflow routes ordered batches through the ownership-preserving service RPC', () => {
  const upsert = node('Upsert Metric Rows');
  assert.equal(upsert.parameters.method, 'POST');
  assert.equal(upsert.parameters.nodeCredentialType, 'supabaseApi');
  assert.equal(upsert.parameters.jsonBody, '={{ { p_rows: $json.rows } }}');
  assert.equal(upsert.parameters.url, 'https://horvjqqifgrzxesuxtfm.supabase.co/rest/v1/rpc/trellis_upsert_youtube_daily_metrics');
  assert.equal(upsert.parameters.sendQuery, false);
  assert.equal(upsert.parameters.queryParameters, undefined);
  for (const [from, to] of [['Build Metric Rows', 'Batch Metric Rows'], ['Batch Metric Rows', 'Upsert Metric Rows']]) {
    assert.equal(workflow.connections[from].main[0][0].node, to);
  }
  assert.equal(workflow.nodes.some(item => item.name === 'Find Existing Metric'), false);
});

test('workflow remains inactive and contains no direct table write node', () => {
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.some(item => item.parameters.method === 'POST' && item.parameters.url?.endsWith('/trellis_youtube_daily_metrics')), false);
});

test('master schema contains the exact versioned RPC and service-only grants', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261122001240_preserve_youtube_metric_ownership.sql', import.meta.url), 'utf8').trim();
  assert.ok(readFileSync(new URL('../constants.ts', import.meta.url), 'utf8').includes(migration));
});

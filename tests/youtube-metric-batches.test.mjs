import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n-blueprints/E9-youtube-analytics-sync.json', import.meta.url)));
const node = name => workflow.nodes.find(item => item.name === name);
const batch = rows => new Function('$input', node('Batch Metric Rows').parameters.jsCode)({ all: () => rows.map(json => ({ json })) });
const row = (index, extra = {}) => ({ youtube_video_id: `video-${index}`, metric_date: '2026-11-20', views: index, ...extra });

for (const count of [0, 1, 499, 500, 501, 1001]) {
  test(`batches ${count} metrics without dropping or duplicating rows`, () => {
    const input = Array.from({ length: count }, (_, index) => row(index));
    const chunks = batch(input);
    assert.ok(chunks.every(chunk => chunk.json.rows.length > 0 && chunk.json.rows.length <= 500));
    assert.deepEqual(chunks.flatMap(chunk => chunk.json.rows), input);
    assert.equal(chunks.length, Math.ceil(count / 500));
  });
}

test('deduplicates conflict keys before chunking and keeps the last observed metric', () => {
  const rows = Array.from({ length: 501 }, (_, index) => row(index));
  rows.push(row(0, { views: 900 }), row(500, { views: 901 }));
  const output = batch(rows).flatMap(chunk => chunk.json.rows);
  assert.equal(output.length, 501);
  assert.equal(output.find(item => item.youtube_video_id === 'video-0').views, 900);
  assert.equal(output.find(item => item.youtube_video_id === 'video-500').views, 901);
});

test('keeps different dates and both publication shapes', () => {
  const rows = [row(1, { episode_id: 'episode', publication_id: 'pub' }), row(1, { metric_date: '2026-11-19', studio_album_id: 'album', studio_publication_id: 'studio' })];
  assert.deepEqual(batch(rows)[0].json.rows, rows);
});

test('rejects missing conflict keys before performing any upsert', () => {
  for (const invalid of [{ metric_date: '2026-11-20' }, { youtube_video_id: 'video' }, null]) {
    assert.throws(() => batch([invalid]), /require youtube_video_id and metric_date/);
  }
});

test('workflow routes complete batches to authenticated conflict-key upserts', () => {
  const upsert = node('Upsert Metric Rows');
  assert.equal(upsert.parameters.method, 'POST');
  assert.equal(upsert.parameters.nodeCredentialType, 'supabaseApi');
  assert.equal(upsert.parameters.jsonBody, '={{ $json.rows }}');
  assert.deepEqual(upsert.parameters.queryParameters.parameters, [{ name: 'on_conflict', value: 'youtube_video_id,metric_date' }]);
  assert.match(upsert.parameters.headerParameters.parameters.find(item => item.name === 'Prefer').value, /resolution=merge-duplicates/);
  for (const [from, to] of [['Build Metric Rows', 'Batch Metric Rows'], ['Batch Metric Rows', 'Upsert Metric Rows']]) {
    assert.equal(workflow.connections[from].main[0][0].node, to);
  }
  assert.equal(workflow.nodes.some(item => item.name === 'Find Existing Metric'), false);
});

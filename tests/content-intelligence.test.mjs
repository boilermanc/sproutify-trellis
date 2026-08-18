import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendPerformance,
  createProject,
  createTask,
  readJsonl,
  upsertCanonical,
  validateProject,
} from '../scripts/content-intelligence.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'trellis-content-'));
  const project = join(root, '.trellis', 'knowledge', 'projects', 'rejoice');
  mkdirSync(project, { recursive: true });
  for (const dataset of ['topics', 'posts', 'experiments', 'performance']) {
    writeFileSync(join(project, `${dataset}.jsonl`), '');
  }
  return root;
}

test('canonical records stay in their declared project and validate references', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = '2026-08-18T12:00:00.000Z';

  upsertCanonical(root, 'rejoice', 'topics', {
    project_id: 'rejoice', topic_id: 'topic_sleep', title: 'Sleep', cluster: 'sleep',
    intent: 'informational', source: 'manual', status: 'active', notes: '', created_at: now, updated_at: now,
  });
  upsertCanonical(root, 'rejoice', 'posts', {
    project_id: 'rejoice', post_id: 'post_sleep_001', topic_id: 'topic_sleep', platform: 'instagram',
    status: 'published', canonical_url: 'https://example.com/p/sleep', published_at: now,
    source_branch: 'content/sleep', task_id: 'content_sleep', title: 'Sleep', primary_query: '', notes: '',
    created_at: now, updated_at: now,
  });
  upsertCanonical(root, 'rejoice', 'experiments', {
    project_id: 'rejoice', experiment_id: 'exp_sleep_001', topic_id: 'topic_sleep', post_id: 'post_sleep_001',
    hypothesis: 'Specific questions outperform generic encouragement.', success_metrics: ['impressions'],
    evaluation_window_days: 30, status: 'running', created_at: now, reviewed_at: '',
  });
  appendPerformance(root, 'rejoice', {
    event_id: 'perf_sleep_001', project_id: 'rejoice', post_id: 'post_sleep_001', experiment_id: 'exp_sleep_001',
    platform: 'instagram', metric_date: '2026-08-18', metrics: { impressions: 120 }, captured_at: now, source: 'manual_import',
  });

  assert.deepEqual(validateProject(root, 'rejoice').errors, []);
  assert.equal(readJsonl(join(root, '.trellis', 'knowledge', 'projects', 'rejoice', 'performance.jsonl')).length, 1);
});

test('post registration is idempotent and rejects canonical URL collisions', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = '2026-08-18T12:00:00.000Z';
  const topic = { project_id: 'rejoice', topic_id: 'topic_one', title: 'One', cluster: '', intent: 'informational', source: 'manual', status: 'active', notes: '', created_at: now, updated_at: now };
  upsertCanonical(root, 'rejoice', 'topics', topic);
  const post = { project_id: 'rejoice', post_id: 'post_one', topic_id: 'topic_one', platform: 'web', status: 'published', canonical_url: 'https://example.com/one', published_at: now, source_branch: '', task_id: '', title: '', primary_query: '', notes: '', created_at: now, updated_at: now };
  assert.equal(upsertCanonical(root, 'rejoice', 'posts', post), 'created');
  assert.equal(upsertCanonical(root, 'rejoice', 'posts', { ...post, notes: 'reviewed' }), 'updated');
  assert.equal(readJsonl(join(root, '.trellis', 'knowledge', 'projects', 'rejoice', 'posts.jsonl')).length, 1);
  assert.throws(() => upsertCanonical(root, 'rejoice', 'posts', { ...post, post_id: 'post_two' }), /already belongs/);
});

test('performance is append-only and duplicate event IDs are idempotent only for identical data', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = '2026-08-18T12:00:00.000Z';
  upsertCanonical(root, 'rejoice', 'topics', { project_id: 'rejoice', topic_id: 'topic_one', title: 'One', cluster: '', intent: 'informational', source: 'manual', status: 'active', notes: '', created_at: now, updated_at: now });
  upsertCanonical(root, 'rejoice', 'posts', { project_id: 'rejoice', post_id: 'post_one', topic_id: 'topic_one', platform: 'instagram', status: 'published', canonical_url: 'https://example.com/one', published_at: now, source_branch: '', task_id: '', title: '', primary_query: '', notes: '', created_at: now, updated_at: now });
  const event = { event_id: 'perf_one', project_id: 'rejoice', post_id: 'post_one', experiment_id: '', platform: 'instagram', metric_date: '2026-08-18', metrics: { clicks: 2 }, captured_at: '2026-08-18T12:00:00.000Z', source: 'manual_import' };
  assert.equal(appendPerformance(root, 'rejoice', event), 'appended');
  assert.equal(appendPerformance(root, 'rejoice', event), 'unchanged');
  assert.throws(() => appendPerformance(root, 'rejoice', { ...event, metrics: { clicks: 3 } }), /different data/);
});

test('registration rejects cross-record references before writing invalid canonical data', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = '2026-08-18T12:00:00.000Z';
  assert.throws(() => upsertCanonical(root, 'rejoice', 'posts', {
    project_id: 'rejoice', post_id: 'post_orphan', topic_id: 'topic_missing', platform: 'web',
    status: 'published', canonical_url: 'https://example.com/orphan', published_at: now,
    source_branch: '', task_id: '', title: '', primary_query: '', notes: '', created_at: now, updated_at: now,
  }), /missing topic_id/);
  assert.equal(readJsonl(join(root, '.trellis', 'knowledge', 'projects', 'rejoice', 'posts.jsonl')).length, 0);
});

test('new tasks require project ownership and create the branch-local working set', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const taskDir = createTask(root, {
    project: 'rejoice', task: 'content_sleep_001', audience: 'Adults seeking a calm starting point',
    topic: 'How can I settle before sleep?', platform: 'instagram',
    hypothesis: 'A concrete nightly question will earn more saves.', 'success-metrics': 'impressions,saves',
  });
  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'));
  assert.equal(task.project_id, 'rejoice');
  assert.deepEqual(task.expected_success_metrics, ['impressions', 'saves']);
  assert.match(readFileSync(join(taskDir, 'retrospective.md'), 'utf8'), /content-learnings\.md/);
});

test('new project partitions are complete, isolated, and immediately discoverable', t => {
  const root = mkdtempSync(join(tmpdir(), 'trellis-project-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(createProject(root, { project: 'atlurbanfarms', name: 'ATL Urban Farms' }), 'atlurbanfarms');
  assert.deepEqual(validateProject(root, 'atlurbanfarms').errors, []);
  assert.match(readFileSync(join(root, '.trellis', 'spec', 'projects', 'atlurbanfarms', 'content-strategy.md'), 'utf8'), /Do not copy another project's strategy/);
  assert.throws(() => createProject(root, { project: 'atlurbanfarms', name: 'Duplicate' }), /already exists/);
});

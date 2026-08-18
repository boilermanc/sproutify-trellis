#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');
const DATASETS = new Set(['topics', 'posts', 'experiments', 'performance']);
const ID_FIELDS = {
  topics: 'topic_id',
  posts: 'post_id',
  experiments: 'experiment_id',
  performance: 'event_id',
};
const STATUS_VALUES = {
  topics: new Set(['active', 'paused', 'retired']),
  posts: new Set(['draft', 'scheduled', 'published', 'archived']),
  experiments: new Set(['planned', 'running', 'reviewed']),
};
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key]?.trim();
  if (!value) fail(`Missing required option --${key}`);
  return value;
}

function assertId(value, label) {
  if (!SAFE_ID.test(value)) fail(`${label} must match ${SAFE_ID}`);
  return value;
}

function iso(value, label, { dateOnly = false } = {}) {
  if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail(`${label} must be a valid date`);
  return dateOnly ? value : parsed.toISOString();
}

function optionalIso(value, label) {
  return value ? iso(value, label) : '';
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseList(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function paths(root, projectId) {
  const project = assertId(projectId, 'project_id');
  const projectDir = join(root, '.trellis', 'knowledge', 'projects', project);
  if (!existsSync(projectDir)) {
    fail(`Unknown project_id "${project}". Add its spec and knowledge partition first.`);
  }
  return {
    projectDir,
    dataset: dataset => join(projectDir, `${dataset}.jsonl`),
    tasksDir: join(root, '.trellis', 'tasks'),
  };
}

function listProjects(root) {
  const base = join(root, '.trellis', 'knowledge', 'projects');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && SAFE_ID.test(entry.name))
    .map(entry => entry.name)
    .sort();
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(item => item.line)
    .map(item => {
      try {
        return JSON.parse(item.line);
      } catch (error) {
        fail(`${file}:${item.number} contains invalid JSON: ${error.message}`);
      }
    });
}

function writeJsonlAtomic(file, records) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8');
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) rmSync(temp);
  }
}

function appendJsonl(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

function validateUrl(value, label, { allowEmpty = true } = {}) {
  if (!value && allowEmpty) return '';
  if (!value) fail(`${label} is required`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${label} must be an absolute http(s) URL`);
  return parsed.toString();
}

function validateRecord(dataset, record, projectId) {
  if (!DATASETS.has(dataset)) fail(`Unknown dataset: ${dataset}`);
  if (!record || Array.isArray(record) || typeof record !== 'object') fail(`${dataset} record must be a JSON object`);
  if (record.project_id !== projectId) fail(`${dataset} record project_id must equal "${projectId}"`);
  assertId(required(record, ID_FIELDS[dataset]), ID_FIELDS[dataset]);

  if (STATUS_VALUES[dataset] && !STATUS_VALUES[dataset].has(record.status)) {
    fail(`${dataset} status must be one of: ${[...STATUS_VALUES[dataset]].join(', ')}`);
  }
  if (dataset === 'topics') {
    required(record, 'title');
    iso(required(record, 'created_at'), 'created_at');
    iso(required(record, 'updated_at'), 'updated_at');
  }
  if (dataset === 'posts') {
    assertId(required(record, 'topic_id'), 'topic_id');
    required(record, 'platform');
    if (record.status === 'published') {
      validateUrl(record.canonical_url, 'canonical_url', { allowEmpty: false });
      iso(required(record, 'published_at'), 'published_at');
    } else {
      validateUrl(record.canonical_url || '', 'canonical_url');
      optionalIso(record.published_at || '', 'published_at');
    }
    if (record.task_id) assertId(record.task_id, 'task_id');
  }
  if (dataset === 'experiments') {
    assertId(required(record, 'topic_id'), 'topic_id');
    if (record.post_id) assertId(record.post_id, 'post_id');
    required(record, 'hypothesis');
    if (!Array.isArray(record.success_metrics) || record.success_metrics.length === 0) {
      fail('success_metrics must be a non-empty array');
    }
    if (!Number.isInteger(record.evaluation_window_days) || record.evaluation_window_days < 1) {
      fail('evaluation_window_days must be a positive integer');
    }
    iso(required(record, 'created_at'), 'created_at');
    optionalIso(record.reviewed_at || '', 'reviewed_at');
  }
  if (dataset === 'performance') {
    assertId(required(record, 'post_id'), 'post_id');
    if (record.experiment_id) assertId(record.experiment_id, 'experiment_id');
    required(record, 'platform');
    iso(required(record, 'metric_date'), 'metric_date', { dateOnly: true });
    if (!record.metrics || Array.isArray(record.metrics) || typeof record.metrics !== 'object') {
      fail('metrics must be a JSON object');
    }
    iso(required(record, 'captured_at'), 'captured_at');
    if (!['manual_import', 'api_import'].includes(record.source)) {
      fail('performance source must be manual_import or api_import');
    }
  }
  return record;
}

function upsertCanonical(root, projectId, dataset, record) {
  const projectPaths = paths(root, projectId);
  const file = projectPaths.dataset(dataset);
  validateRecord(dataset, record, projectId);
  if (dataset === 'posts' || dataset === 'experiments') {
    const topics = readJsonl(projectPaths.dataset('topics'));
    if (!topics.some(topic => topic.topic_id === record.topic_id)) {
      fail(`${dataset} record references missing topic_id ${record.topic_id}`);
    }
  }
  if (dataset === 'experiments' && record.post_id) {
    const posts = readJsonl(projectPaths.dataset('posts'));
    if (!posts.some(post => post.post_id === record.post_id)) {
      fail(`experiments record references missing post_id ${record.post_id}`);
    }
  }
  const idField = ID_FIELDS[dataset];
  const records = readJsonl(file);
  const index = records.findIndex(item => item[idField] === record[idField]);
  if (dataset === 'posts' && record.canonical_url) {
    const duplicateUrl = records.find(item => item.canonical_url === record.canonical_url && item.post_id !== record.post_id);
    if (duplicateUrl) fail(`canonical_url already belongs to ${duplicateUrl.post_id}`);
  }
  if (index >= 0) {
    const createdAt = records[index].created_at || record.created_at;
    records[index] = { ...records[index], ...record, ...(createdAt ? { created_at: createdAt } : {}) };
  }
  else records.push(record);
  writeJsonlAtomic(file, records);
  return index >= 0 ? 'updated' : 'created';
}

function appendPerformance(root, projectId, record) {
  const projectPaths = paths(root, projectId);
  const file = projectPaths.dataset('performance');
  validateRecord('performance', record, projectId);
  if (!readJsonl(projectPaths.dataset('posts')).some(post => post.post_id === record.post_id)) {
    fail(`performance record references missing post_id ${record.post_id}`);
  }
  if (record.experiment_id && !readJsonl(projectPaths.dataset('experiments')).some(experiment => experiment.experiment_id === record.experiment_id)) {
    fail(`performance record references missing experiment_id ${record.experiment_id}`);
  }
  const records = readJsonl(file);
  const existing = records.find(item => item.event_id === record.event_id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(record)) return 'unchanged';
    fail(`event_id ${record.event_id} already exists with different data`);
  }
  appendJsonl(file, record);
  return 'appended';
}

function currentBranch(root) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function createProject(root, options) {
  const projectId = assertId(required(options, 'project'), 'project_id');
  const projectName = required(options, 'name');
  const knowledgeDir = join(root, '.trellis', 'knowledge', 'projects', projectId);
  const specDir = join(root, '.trellis', 'spec', 'projects', projectId);
  if (existsSync(knowledgeDir) || existsSync(specDir)) fail(`Project partition already exists: ${projectId}`);

  const files = {
    [join(knowledgeDir, 'topics.jsonl')]: '',
    [join(knowledgeDir, 'posts.jsonl')]: '',
    [join(knowledgeDir, 'experiments.jsonl')]: '',
    [join(knowledgeDir, 'performance.jsonl')]: '',
    [join(knowledgeDir, 'open-questions.md')]: `# ${projectName} Open Questions\n\nUse this file for unresolved identity, attribution, mapping, and measurement issues.\n\n## Unresolved\n\n- Which external analytics sources are authoritative for this project's channels?\n- Which existing assets need canonical registration?\n- What baseline should the first experiments use?\n`,
    [join(knowledgeDir, 'topic-clusters.md')]: `# ${projectName} Topic Clusters\n\nThis is a human-readable map, not the canonical topic registry. Add evidence-backed questions to \`topics.jsonl\`.\n\n## Current strategic landscape\n\nDocument project-specific clusters before beginning broad content production.\n\n## Coverage notes\n\nNo canonical topics have been registered yet.\n`,
    [join(specDir, 'content-strategy.md')]: `# ${projectName} Content Strategy\n\n## Audience and goal\n\nDocument this project's audience and desired behavior. Do not copy another project's strategy.\n\n## Positioning\n\nDefine the distinct promise and category.\n\n## Voice\n\nDocument tone, claims, boundaries, and language to avoid.\n\n## Channel priorities\n\nRank the channels that matter and explain their roles.\n\n## Content that matters\n\nDefine the questions, situations, and formats worth producing.\n`,
    [join(specDir, 'seo-social-rules.md')]: `# ${projectName} SEO and Social Rules\n\n## Topic selection\n\nDefine evidence sources and project-specific selection heuristics.\n\n## Search assets\n\nDefine query mapping, structure, claims, and conversion expectations.\n\n## Social posts\n\nDefine channel rules, useful variation axes, and format constraints.\n\n## Good hypotheses\n\nDescribe what makes a falsifiable, measurable hypothesis for this project.\n`,
    [join(specDir, 'content-learnings.md')]: `# ${projectName} Content Learnings\n\nThis project-specific playbook starts intentionally empty. Promote only reviewed findings supported by this project's evidence.\n\n## Entry format\n\n### YYYY-MM-DD — Concise finding\n\n- **Finding:** A bounded recommendation.\n- **Evidence:** Task, experiment, post, and performance event IDs.\n- **Confidence:** low | medium | high\n- **Conditions:** Audience, channel, format, timing, and limits.\n- **Next use:** How a future task should apply or retest it.\n\n## Promoted learnings\n\nNone yet.\n`,
  };

  const created = [];
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
      created.push(file);
    }
  } catch (error) {
    for (const file of created.reverse()) if (existsSync(file)) rmSync(file);
    fail(`Could not create project partition: ${error.message}`);
  }
  return projectId;
}

function taskFiles(task) {
  const metrics = task.expected_success_metrics.join(', ');
  return {
    'task.json': `${JSON.stringify(task, null, 2)}\n`,
    'prd.md': `# ${task.topic_question}\n\n## Goal\n\nCreate a ${task.platform} content asset for **${task.project_id}** that answers the defined question for the target audience.\n\n## Ownership\n\n- Project: \`${task.project_id}\`\n- Topic ID: ${task.topic_id ? `\`${task.topic_id}\`` : 'Unassigned — register or link before publication'}\n- Source branch: \`${task.source_branch || 'unknown'}\`\n\n## Audience and question\n\n- Audience: ${task.target_audience}\n- Question/topic: ${task.topic_question}\n- Platform: ${task.platform}\n\n## Hypothesis\n\n${task.hypothesis}\n\n## Expected success metrics\n\n${task.expected_success_metrics.map(metric => `- ${metric}`).join('\n')}\n\n## Acceptance criteria\n\n- [ ] Research supports why this question matters to this project's audience.\n- [ ] Draft follows \`.trellis/spec/projects/${task.project_id}/\` guidance.\n- [ ] Published asset is registered in the project's canonical \`posts.jsonl\`.\n- [ ] Experiment is registered when this task tests a hypothesis.\n- [ ] Performance events are appended after the evaluation window.\n`,
    'research.md': `# Research\n\n## Signals\n\nCapture query data, customer questions, social evidence, and source links. Distinguish observations from assumptions.\n\n## Project context\n\nExplain why this evidence matters specifically to **${task.project_id}**. Do not import another project's assumptions.\n\n## Decision\n\nSummarize the angle selected and why.\n`,
    'results.md': `# Results\n\n## Evaluation\n\n- Window: TBD\n- Expected metrics: ${metrics}\n- Canonical post ID: TBD\n- Experiment ID: TBD\n\n## Observed performance\n\nLink or summarize the relevant append-only performance events.\n\n## Hypothesis outcome\n\nState supported, mixed, unsupported, or inconclusive, with evidence.\n`,
    'retrospective.md': `# Retrospective\n\n## What happened\n\nSummarize the outcome without turning a single result into a universal rule.\n\n## Durable learning candidate\n\n- Finding:\n- Evidence:\n- Confidence: low | medium | high\n- Scope/conditions:\n\n## Promotion\n\n- [ ] No durable learning identified\n- [ ] Promoted to \`.trellis/spec/projects/${task.project_id}/content-learnings.md\`\n\nIf promoted, add the date, evidence IDs, confidence, and conditions to the project-specific file.\n`,
    'drafts/.gitkeep': '',
  };
}

function createTask(root, options) {
  const projectId = assertId(required(options, 'project'), 'project_id');
  paths(root, projectId);
  const taskId = assertId(required(options, 'task'), 'task_id');
  const taskDir = join(root, '.trellis', 'tasks', taskId);
  if (existsSync(taskDir)) fail(`Task already exists: ${taskId}`);
  const now = new Date().toISOString();
  const task = {
    task_id: taskId,
    project_id: projectId,
    status: 'plan',
    target_audience: required(options, 'audience'),
    topic_question: required(options, 'topic'),
    platform: required(options, 'platform'),
    hypothesis: required(options, 'hypothesis'),
    topic_id: options['topic-id'] ? assertId(options['topic-id'], 'topic_id') : '',
    expected_success_metrics: parseList(required(options, 'success-metrics')),
    source_branch: options['source-branch'] || currentBranch(root),
    created_at: now,
    updated_at: now,
  };
  if (task.expected_success_metrics.length === 0) fail('At least one success metric is required');
  for (const [relative, content] of Object.entries(taskFiles(task))) {
    const file = join(taskDir, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  return taskDir;
}

function validateProject(root, projectId) {
  const projectPaths = paths(root, projectId);
  const datasets = Object.fromEntries([...DATASETS].map(dataset => [dataset, readJsonl(projectPaths.dataset(dataset))]));
  const errors = [];
  for (const [dataset, records] of Object.entries(datasets)) {
    const seen = new Set();
    for (const record of records) {
      try {
        validateRecord(dataset, record, projectId);
      } catch (error) {
        errors.push(`${dataset}: ${error.message}`);
      }
      const id = record[ID_FIELDS[dataset]];
      if (seen.has(id)) errors.push(`${dataset}: duplicate ${ID_FIELDS[dataset]} ${id}`);
      seen.add(id);
    }
  }
  const topicIds = new Set(datasets.topics.map(item => item.topic_id));
  const postIds = new Set(datasets.posts.map(item => item.post_id));
  const experimentIds = new Set(datasets.experiments.map(item => item.experiment_id));
  const urls = new Map();
  for (const post of datasets.posts) {
    if (!topicIds.has(post.topic_id)) errors.push(`posts: ${post.post_id} references missing topic_id ${post.topic_id}`);
    if (post.canonical_url) {
      if (urls.has(post.canonical_url)) errors.push(`posts: duplicate canonical_url on ${urls.get(post.canonical_url)} and ${post.post_id}`);
      urls.set(post.canonical_url, post.post_id);
    }
  }
  for (const experiment of datasets.experiments) {
    if (!topicIds.has(experiment.topic_id)) errors.push(`experiments: ${experiment.experiment_id} references missing topic_id ${experiment.topic_id}`);
    if (experiment.post_id && !postIds.has(experiment.post_id)) errors.push(`experiments: ${experiment.experiment_id} references missing post_id ${experiment.post_id}`);
  }
  for (const event of datasets.performance) {
    if (!postIds.has(event.post_id)) errors.push(`performance: ${event.event_id} references missing post_id ${event.post_id}`);
    if (event.experiment_id && !experimentIds.has(event.experiment_id)) errors.push(`performance: ${event.event_id} references missing experiment_id ${event.experiment_id}`);
  }
  return { project_id: projectId, counts: Object.fromEntries(Object.entries(datasets).map(([key, value]) => [key, value.length])), errors };
}

function recordFromOptions(dataset, projectId, options) {
  const now = new Date().toISOString();
  if (options.json) return parseJson(options.json, '--json');
  if (dataset === 'topics') return {
    project_id: projectId,
    topic_id: assertId(required(options, 'topic-id'), 'topic_id'),
    title: required(options, 'title'),
    cluster: options.cluster || '',
    intent: options.intent || 'informational',
    source: options.source || 'manual',
    status: options.status || 'active',
    notes: options.notes || '',
    created_at: options['created-at'] ? iso(options['created-at'], 'created_at') : now,
    updated_at: now,
  };
  if (dataset === 'posts') return {
    project_id: projectId,
    post_id: assertId(required(options, 'post-id'), 'post_id'),
    topic_id: assertId(required(options, 'topic-id'), 'topic_id'),
    platform: required(options, 'platform'),
    status: options.status || 'published',
    canonical_url: validateUrl(options['canonical-url'] || '', 'canonical_url'),
    published_at: optionalIso(options['published-at'] || '', 'published_at'),
    source_branch: options['source-branch'] || currentBranch(options.root),
    task_id: options['task-id'] || '',
    title: options.title || '',
    primary_query: options['primary-query'] || '',
    notes: options.notes || '',
    created_at: options['created-at'] ? iso(options['created-at'], 'created_at') : now,
    updated_at: now,
  };
  if (dataset === 'experiments') return {
    project_id: projectId,
    experiment_id: assertId(required(options, 'experiment-id'), 'experiment_id'),
    topic_id: assertId(required(options, 'topic-id'), 'topic_id'),
    post_id: options['post-id'] || '',
    hypothesis: required(options, 'hypothesis'),
    success_metrics: parseList(required(options, 'success-metrics')),
    evaluation_window_days: Number(options['window-days'] || 30),
    status: options.status || 'planned',
    created_at: options['created-at'] ? iso(options['created-at'], 'created_at') : now,
    reviewed_at: optionalIso(options['reviewed-at'] || '', 'reviewed_at'),
  };
  return {
    event_id: options['event-id'] || `perf_${Date.now()}_${randomUUID().slice(0, 8)}`,
    project_id: projectId,
    post_id: assertId(required(options, 'post-id'), 'post_id'),
    experiment_id: options['experiment-id'] || '',
    platform: required(options, 'platform'),
    metric_date: iso(required(options, 'metric-date'), 'metric_date', { dateOnly: true }),
    metrics: parseJson(required(options, 'metrics'), '--metrics'),
    captured_at: options['captured-at'] ? iso(options['captured-at'], 'captured_at') : now,
    source: options.source || 'manual_import',
  };
}

function help() {
  return `Trellis content intelligence CLI

Commands:
  projects
  create-project --project ID --name TEXT
  create-task --project ID --task ID --audience TEXT --topic TEXT --platform NAME --hypothesis TEXT --success-metrics a,b [--topic-id ID]
  register-topic --project ID --topic-id ID --title TEXT [--cluster NAME] [--intent NAME] [--source NAME]
  register-post --project ID --post-id ID --topic-id ID --platform NAME --status published --canonical-url URL --published-at ISO [--task-id ID]
  register-experiment --project ID --experiment-id ID --topic-id ID --hypothesis TEXT --success-metrics a,b [--post-id ID] [--window-days 30]
  append-performance --project ID --post-id ID --platform NAME --metric-date YYYY-MM-DD --metrics JSON [--experiment-id ID] [--source manual_import|api_import]
  append-record --project ID --dataset topics|posts|experiments|performance --json JSON
  validate [--project ID]

All commands accept --root PATH for isolated testing or a non-default checkout.`;
}

export function run(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  const root = resolve(options.root || defaultRoot);
  options.root = root;
  if (!command || command === 'help') return help();
  if (command === 'projects') return listProjects(root).join('\n');
  if (command === 'create-project') return `Created project partition ${createProject(root, options)}`;
  if (command === 'create-task') return `Created ${createTask(root, options)}`;
  if (command === 'validate') {
    const projects = options.project ? [assertId(options.project, 'project_id')] : listProjects(root);
    if (projects.length === 0) fail('No project partitions found');
    const results = projects.map(project => validateProject(root, project));
    const invalid = results.filter(result => result.errors.length);
    if (invalid.length) fail(results.map(result => `${result.project_id}: ${result.errors.join('; ') || 'ok'}`).join('\n'));
    return results.map(result => `${result.project_id}: ok ${JSON.stringify(result.counts)}`).join('\n');
  }
  const projectId = assertId(required(options, 'project'), 'project_id');
  const commandDataset = {
    'register-topic': 'topics',
    'register-post': 'posts',
    'register-experiment': 'experiments',
    'append-performance': 'performance',
  };
  const dataset = command === 'append-record'
    ? required(options, 'dataset')
    : commandDataset[command];
  if (!DATASETS.has(dataset)) fail(`Unknown command: ${command}`);
  const record = recordFromOptions(dataset, projectId, options);
  if (dataset === 'performance') return `${appendPerformance(root, projectId, record)} ${record.event_id}`;
  return `${upsertCanonical(root, projectId, dataset, record)} ${record[ID_FIELDS[dataset]]}`;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    console.log(run());
  } catch (error) {
    console.error(`Content intelligence error: ${error.message}`);
    process.exitCode = 1;
  }
}

export { appendPerformance, createProject, createTask, listProjects, readJsonl, upsertCanonical, validateProject, validateRecord };

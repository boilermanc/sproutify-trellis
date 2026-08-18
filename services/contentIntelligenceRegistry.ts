export interface ContentTopic {
  project_id: string;
  topic_id: string;
  title: string;
  cluster: string;
  intent: string;
  source: string;
  status: 'active' | 'paused' | 'retired';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ContentPost {
  project_id: string;
  post_id: string;
  topic_id: string;
  platform: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  canonical_url: string;
  published_at: string;
  source_branch: string;
  task_id: string;
  title: string;
  primary_query: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface ContentExperiment {
  project_id: string;
  experiment_id: string;
  topic_id: string;
  post_id: string;
  hypothesis: string;
  success_metrics: string[];
  evaluation_window_days: number;
  status: 'planned' | 'running' | 'reviewed';
  created_at: string;
  reviewed_at: string;
}

export interface ContentPerformanceEvent {
  event_id: string;
  project_id: string;
  post_id: string;
  experiment_id: string;
  platform: string;
  metric_date: string;
  metrics: Record<string, unknown>;
  captured_at: string;
  source: 'manual_import' | 'api_import';
}

export interface ContentIntelligenceProject {
  projectId: string;
  topics: ContentTopic[];
  posts: ContentPost[];
  experiments: ContentExperiment[];
  performance: ContentPerformanceEvent[];
  openQuestions: string;
  topicClusters: string;
  contentStrategy: string;
  seoSocialRules: string;
  contentLearnings: string;
  loadErrors: string[];
}

const knowledgeJsonlFiles = import.meta.glob('../.trellis/knowledge/projects/*/*.jsonl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const knowledgeMarkdownFiles = import.meta.glob('../.trellis/knowledge/projects/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const projectSpecFiles = import.meta.glob('../.trellis/spec/projects/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function parsePath(path: string, section: 'knowledge' | 'spec') {
  const pattern = section === 'knowledge'
    ? /\.trellis\/knowledge\/projects\/([^/]+)\/([^/]+)\.(jsonl|md)$/
    : /\.trellis\/spec\/projects\/([^/]+)\/([^/]+)\.md$/;
  const match = path.replace(/\\/g, '/').match(pattern);
  return match ? { projectId: match[1], fileName: match[2] } : null;
}

function parseJsonl<T>(raw: string, path: string, errors: string[]): T[] {
  return raw
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(item => item.line)
    .flatMap(item => {
      try {
        return [JSON.parse(item.line) as T];
      } catch (error) {
        errors.push(`${path}:${item.lineNumber} — ${error instanceof Error ? error.message : 'invalid JSON'}`);
        return [];
      }
    });
}

function blankProject(projectId: string): ContentIntelligenceProject {
  return {
    projectId,
    topics: [],
    posts: [],
    experiments: [],
    performance: [],
    openQuestions: '',
    topicClusters: '',
    contentStrategy: '',
    seoSocialRules: '',
    contentLearnings: '',
    loadErrors: [],
  };
}

function buildRegistry(): ContentIntelligenceProject[] {
  const projects = new Map<string, ContentIntelligenceProject>();
  const getProject = (projectId: string) => {
    if (!projects.has(projectId)) projects.set(projectId, blankProject(projectId));
    return projects.get(projectId)!;
  };

  for (const [path, raw] of Object.entries(knowledgeJsonlFiles)) {
    const parsed = parsePath(path, 'knowledge');
    if (!parsed) continue;
    const project = getProject(parsed.projectId);
    if (parsed.fileName === 'topics') project.topics = parseJsonl<ContentTopic>(raw, path, project.loadErrors);
    if (parsed.fileName === 'posts') project.posts = parseJsonl<ContentPost>(raw, path, project.loadErrors);
    if (parsed.fileName === 'experiments') project.experiments = parseJsonl<ContentExperiment>(raw, path, project.loadErrors);
    if (parsed.fileName === 'performance') project.performance = parseJsonl<ContentPerformanceEvent>(raw, path, project.loadErrors);
  }

  for (const [path, raw] of Object.entries(knowledgeMarkdownFiles)) {
    const parsed = parsePath(path, 'knowledge');
    if (!parsed) continue;
    const project = getProject(parsed.projectId);
    if (parsed.fileName === 'open-questions') project.openQuestions = raw;
    if (parsed.fileName === 'topic-clusters') project.topicClusters = raw;
  }

  for (const [path, raw] of Object.entries(projectSpecFiles)) {
    const parsed = parsePath(path, 'spec');
    if (!parsed) continue;
    const project = getProject(parsed.projectId);
    if (parsed.fileName === 'content-strategy') project.contentStrategy = raw;
    if (parsed.fileName === 'seo-social-rules') project.seoSocialRules = raw;
    if (parsed.fileName === 'content-learnings') project.contentLearnings = raw;
  }

  return [...projects.values()].sort((a, b) => a.projectId.localeCompare(b.projectId));
}

export const CONTENT_INTELLIGENCE_PROJECTS = buildRegistry();

export function getContentIntelligenceProject(projectId: string) {
  return CONTENT_INTELLIGENCE_PROJECTS.find(project => project.projectId === projectId);
}

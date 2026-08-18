import { supabase } from '../lib/supabase';
import type {
  ContentExperiment,
  ContentPerformanceEvent,
  ContentPost,
} from './contentIntelligenceRegistry';

interface InsightRow {
  id: string;
  scheduled_post_id: string;
  platform: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  raw: unknown;
  fetched_at: string;
}

function parseRaw(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function metricsForRow(row: InsightRow): Record<string, number | null> {
  if (row.platform === 'facebook') {
    const raw = parseRaw(row.raw);
    const reactions = raw.post_reactions_by_type_total;
    const reactionCount = typeof reactions === 'number'
      ? reactions
      : reactions && typeof reactions === 'object'
        ? Object.values(reactions).reduce((sum, value) => sum + (Number(value) || 0), 0)
        : null;
    return {
      impressions: numeric(raw.post_impressions),
      reach_unique: numeric(raw.post_impressions_unique),
      engaged_users: numeric(raw.post_engaged_users),
      clicks: numeric(raw.post_clicks),
      reactions: reactionCount,
    };
  }

  return {
    impressions: row.impressions ?? 0,
    reach: row.reach ?? 0,
    likes: row.likes ?? 0,
    comments: row.comments ?? 0,
    saves: row.saves,
    shares: row.shares ?? 0,
  };
}

async function fetchInsightRows(scheduledPostIds: string[]): Promise<InsightRow[]> {
  const ids = [...new Set(scheduledPostIds.filter(Boolean))];
  const rows: InsightRow[] = [];

  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    for (let page = 0; ; page += 1) {
      const from = page * 1000;
      const { data, error } = await supabase
        .from('social_post_insights')
        .select('id, scheduled_post_id, platform, impressions, reach, likes, comments, saves, shares, raw, fetched_at')
        .in('scheduled_post_id', chunk)
        .order('fetched_at', { ascending: false })
        .range(from, from + 999);

      if (error) throw new Error(`Could not load social insight history: ${error.message}`);
      const pageRows = (data || []) as InsightRow[];
      rows.push(...pageRows);
      if (pageRows.length < 1000) break;
    }
  }

  return rows.sort((left, right) => right.fetched_at.localeCompare(left.fetched_at));
}

export async function fetchImportedContentPerformance(
  posts: ContentPost[],
  experiments: ContentExperiment[],
): Promise<ContentPerformanceEvent[]> {
  const postsBySource = new Map(
    posts.filter(post => post.source_record_id).map(post => [post.source_record_id as string, post]),
  );
  if (postsBySource.size === 0) return [];

  const experimentsByPost = new Map<string, ContentExperiment[]>();
  experiments.forEach(experiment => {
    if (!experiment.post_id) return;
    experimentsByPost.set(experiment.post_id, [...(experimentsByPost.get(experiment.post_id) || []), experiment]);
  });

  const history = await fetchInsightRows([...postsBySource.keys()]);
  return history.flatMap(row => {
    const post = postsBySource.get(row.scheduled_post_id);
    if (!post) return [];
    const linkedExperiments = experimentsByPost.get(post.post_id) || [];
    return [{
      event_id: `social_insight_${row.id}`,
      project_id: post.project_id,
      post_id: post.post_id,
      experiment_id: linkedExperiments.length === 1 ? linkedExperiments[0].experiment_id : '',
      platform: row.platform,
      metric_date: row.fetched_at.slice(0, 10),
      metrics: metricsForRow(row),
      captured_at: row.fetched_at,
      source: 'api_import' as const,
    }];
  });
}

import {
  ContentExperiment,
  ContentPerformanceEvent,
  ContentPost,
} from './contentIntelligenceRegistry';
import {
  fetchInsightHistory,
  getDisplayInsights,
  PostInsightSnapshot,
} from './socialInsightsService';

function metricsForSnapshot(snapshot: PostInsightSnapshot): Record<string, unknown> {
  const display = getDisplayInsights(snapshot);
  if (display.platform === 'facebook') {
    return {
      impressions: display.impressions,
      reach_unique: display.reachUnique,
      engaged_users: display.engagedUsers,
      clicks: display.clicks,
      reactions: display.reactions,
    };
  }
  return {
    impressions: snapshot.impressions,
    reach: snapshot.reach,
    likes: snapshot.likes,
    comments: snapshot.comments,
    saves: snapshot.saves,
    shares: snapshot.shares,
  };
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

  const history = await fetchInsightHistory([...postsBySource.keys()]);
  return history.flatMap(snapshot => {
    const post = postsBySource.get(snapshot.scheduled_post_id);
    if (!post) return [];
    const linkedExperiments = experimentsByPost.get(post.post_id) || [];
    return [{
      event_id: `social_insight_${snapshot.id}`,
      project_id: post.project_id,
      post_id: post.post_id,
      experiment_id: linkedExperiments.length === 1 ? linkedExperiments[0].experiment_id : '',
      platform: snapshot.platform,
      metric_date: snapshot.fetched_at.slice(0, 10),
      metrics: metricsForSnapshot(snapshot),
      captured_at: snapshot.fetched_at,
      source: 'api_import' as const,
    }];
  });
}

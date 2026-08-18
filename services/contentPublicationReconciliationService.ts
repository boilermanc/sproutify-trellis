import { ScheduledPost } from '../types';
import { ContentPost } from './contentIntelligenceRegistry';
import { fetchScheduledPosts } from './scheduledPostService';
import { fetchLatestInsights, PostInsightSnapshot } from './socialInsightsService';

export interface PublishedContentCandidate {
  sourceRecordId: string;
  projectId: string;
  platform: ScheduledPost['platform'];
  externalPostId: string;
  publishedAt: string;
  caption: string;
  mediaType: ScheduledPost['media_type'];
  mediaUrls: string[];
  source: string;
  suggestedPostId: string;
  insight: PostInsightSnapshot | null;
}

function suggestedPostId(post: ScheduledPost, projectId: string): string {
  const date = new Date(post.published_at || post.scheduled_for);
  const year = Number.isNaN(date.valueOf()) ? 'unknown' : String(date.getUTCFullYear());
  const month = Number.isNaN(date.valueOf()) ? 'unknown' : String(date.getUTCMonth() + 1).padStart(2, '0');
  const suffix = post.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toLowerCase() || 'asset';
  return `post_${year}_${month}_${projectId}_${suffix}`;
}

export function isPublishedPostRegistered(post: ScheduledPost, canonicalPosts: ContentPost[]): boolean {
  return canonicalPosts.some(canonical => {
    if (canonical.source_record_id && canonical.source_record_id === post.id) return true;
    return Boolean(
      canonical.external_post_id
      && post.post_id
      && canonical.platform === post.platform
      && canonical.external_post_id === post.post_id,
    );
  });
}

export async function fetchPublishedContentCandidates(
  projectId: string,
  canonicalPosts: ContentPost[],
): Promise<PublishedContentCandidate[]> {
  const published = await fetchScheduledPosts({ branchSlug: projectId, status: 'published' });
  const unregistered = published.filter(post => !isPublishedPostRegistered(post, canonicalPosts));
  const insights = await fetchLatestInsights(unregistered.map(post => post.id));

  return unregistered
    .map(post => ({
      sourceRecordId: post.id,
      projectId,
      platform: post.platform,
      externalPostId: post.post_id || '',
      publishedAt: post.published_at || post.scheduled_for,
      caption: post.caption || '',
      mediaType: post.media_type,
      mediaUrls: post.media_urls,
      source: post.source || 'scheduled_social_posts',
      suggestedPostId: suggestedPostId(post, projectId),
      insight: insights.get(post.id) || null,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

import { supabase } from '../lib/supabase';
import { ContentPost, ContentTopic } from './contentIntelligenceRegistry';
import { PublishedContentCandidate } from './contentPublicationReconciliationService';

export interface ApprovedContentRegistry {
  posts: ContentPost[];
  topics: ContentTopic[];
}

export interface ApproveContentRegistrationInput {
  candidate: PublishedContentCandidate;
  topicId: string;
  topicTitle: string;
  postId: string;
  canonicalUrl: string;
  taskId?: string;
  title?: string;
}

function requireHttpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter the real public HTTPS URL for this post.');
  }
  if (url.protocol !== 'https:') throw new Error('The canonical post URL must use HTTPS.');
  return url.toString();
}

function friendlyRegistrationError(message: string): string {
  if (/duplicate key|23505/i.test(message)) return 'This publication is already registered. Refreshing the queue will remove it.';
  if (/row-level security|42501|permission denied/i.test(message)) return 'Your Trellis role does not have permission to approve content registrations.';
  if (/foreign key|23503/i.test(message)) return 'The selected topic or publication is no longer available. Refresh and try again.';
  return `Could not approve this publication: ${message}`;
}

export async function fetchApprovedContentRegistry(projectId: string): Promise<ApprovedContentRegistry> {
  const [postsResult, topicsResult] = await Promise.all([
    supabase.from('content_intelligence_posts').select('*').eq('project_id', projectId).order('published_at', { ascending: false }),
    supabase.from('content_intelligence_topics').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
  ]);

  if (postsResult.error) throw new Error(`Could not load approved content: ${postsResult.error.message}`);
  if (topicsResult.error) throw new Error(`Could not load approved topics: ${topicsResult.error.message}`);

  return {
    posts: (postsResult.data || []) as ContentPost[],
    topics: (topicsResult.data || []) as ContentTopic[],
  };
}

export async function approveContentRegistration(input: ApproveContentRegistrationInput): Promise<ContentPost> {
  const topicId = input.topicId.trim();
  const topicTitle = input.topicTitle.trim();
  const postId = input.postId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{2,127}$/.test(topicId)) throw new Error('Topic ID must use lowercase letters, numbers, underscores, or hyphens.');
  if (topicTitle.length < 3) throw new Error('Enter a clear audience question or topic title.');
  if (!/^[a-z0-9][a-z0-9_-]{2,127}$/.test(postId)) throw new Error('Post ID must use lowercase letters, numbers, underscores, or hyphens.');

  const { data, error } = await supabase.rpc('approve_content_registration', {
    p_project_id: input.candidate.projectId,
    p_topic_id: topicId,
    p_topic_title: topicTitle,
    p_post_id: postId,
    p_platform: input.candidate.platform,
    p_canonical_url: requireHttpsUrl(input.canonicalUrl),
    p_published_at: input.candidate.publishedAt,
    p_source_record_id: input.candidate.sourceRecordId,
    p_external_post_id: input.candidate.externalPostId || null,
    p_task_id: input.taskId?.trim() || null,
    p_title: input.title?.trim() || null,
  });

  if (error) throw new Error(friendlyRegistrationError(error.message));
  const row = (Array.isArray(data) ? data[0] : data) as ContentPost | null;
  if (!row) throw new Error('The approval completed without returning a registered post. Refresh and check the registry.');
  return row;
}

export function mergeContentRecords<T extends object>(
  versioned: T[],
  approved: T[],
  identity: keyof T,
): T[] {
  const merged = new Map<string, T>();
  versioned.forEach(record => merged.set(String(record[identity]), record));
  approved.forEach(record => merged.set(String(record[identity]), record));
  return [...merged.values()];
}

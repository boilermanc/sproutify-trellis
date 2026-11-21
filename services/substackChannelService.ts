import { supabase } from '../lib/supabase';

export interface SubstackChannel {
  id: string;
  name: string;
  publicationUrl: string;
  feedUrl: string;
  dashboardUrl: string;
  statsUrl: string;
  sections: string[];
}

export interface SubstackArticle {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  description: string;
  categories: string[];
}

export interface SubstackFeedResult {
  channel: SubstackChannel;
  articles: SubstackArticle[];
  fetchedAt: string;
}

export const SWEETWATER_SUBSTACK_CHANNEL: SubstackChannel = {
  id: 'sweetwater-technology-substack',
  name: 'Sweetwater Technology',
  publicationUrl: 'https://sweetwatertechnology.substack.com',
  feedUrl: 'https://sweetwatertechnology.substack.com/feed',
  dashboardUrl: 'https://sweetwatertechnology.substack.com/publish',
  statsUrl: 'https://sweetwatertechnology.substack.com/publish/stats',
  sections: ['Sweetwater Technology', 'Rekkrd', 'Rejoice'],
};

function isArticle(value: unknown): value is SubstackArticle {
  if (!value || typeof value !== 'object') return false;
  const article = value as Record<string, unknown>;
  return typeof article.id === 'string'
    && typeof article.title === 'string'
    && typeof article.url === 'string'
    && (article.publishedAt === null || typeof article.publishedAt === 'string')
    && typeof article.description === 'string'
    && Array.isArray(article.categories);
}

/**
 * Reads the public publication feed through the allowlisted Edge Function.
 * This imports public article metadata only; subscriber/profile data remains in Substack.
 */
export async function fetchSubstackArticles(limit = 8): Promise<SubstackFeedResult> {
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
  const { data, error } = await supabase.functions.invoke('substack-feed', {
    body: {
      publication_url: SWEETWATER_SUBSTACK_CHANNEL.publicationUrl,
      limit: safeLimit,
    },
  });

  if (error) throw new Error(`Substack feed sync failed: ${error.message}`);
  if (!data || !Array.isArray(data.articles)) throw new Error('Substack feed returned an invalid response.');

  return {
    channel: SWEETWATER_SUBSTACK_CHANNEL,
    articles: data.articles.filter(isArticle).slice(0, safeLimit),
    fetchedAt: typeof data.fetched_at === 'string' ? data.fetched_at : new Date().toISOString(),
  };
}

import { supabase } from '../lib/supabase';

export interface RadarConfig {
  website: string;
  country: string;
  language: string;
  category: string;
  brief: string;
  strategy: string;
  existing_pages: string[];
  interval_days: number;
  auto_draft: boolean;
}
export interface RadarSource { url: string; title: string }
export interface RadarOpportunity {
  id: string;
  query: string;
  title: string;
  country: string;
  rationale: string;
  buyer_intent: string;
  recommendation: 'new_article' | 'update_existing' | 'needs_review';
  existing_url: string | null;
  validation_notes: string;
  status: 'new' | 'drafted' | 'dismissed';
  draft_status: 'idle' | 'generating' | 'ready' | 'failed';
  draft_error: string | null;
  draft_started_at: string | null;
  evidence: {
    kind: string;
    captured_at?: string;
    sources: RadarSource[];
    search_entry_point?: string;
    signal?: { source_url: string; captured_at: string; growth_display?: string; traffic_display?: string; filters?: { country: string; category: string; date: string; seed: string; property: string } };
  };
  draft: null | {
    title: string;
    article_markdown: string;
    citation_review_required?: boolean;
    reused_research?: boolean;
    meta_description: string;
    social_posts: { platform: string; text: string }[];
    sources: RadarSource[];
    search_entry_point?: string;
  };
  created_at: string;
}
export interface RadarRun {
  id: string;
  status: 'running' | 'completed' | 'empty' | 'failed';
  trigger_kind: string;
  started_at: string;
  lease_expires_at: string;
  new_opportunities: number;
  error_message: string | null;
  warnings: string[];
}
export interface RadarSnapshot {
  settings: null | { config: RadarConfig; enabled: boolean; next_run_at: string };
  opportunities: RadarOpportunity[];
  runs: RadarRun[];
  can_manage: boolean;
}

export async function radarRequest<T>(projectId: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('content-trend-radar', {
    body: { ...payload, project_id: projectId, action },
    signal: AbortSignal.timeout(300000),
  });
  if (error) {
    let detail = '';
    if (error.context instanceof Response) {
      const response = await error.context.json().catch(() => null);
      detail = response?.error || '';
    }
    throw new Error(detail || 'Trend Radar could not finish the request. Refresh to check saved progress before retrying.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function radarDraftText(opportunity: RadarOpportunity): string {
  const draft = opportunity.draft;
  if (!draft) return '';
  return `${draft.citation_review_required ? "Editorial review: verify factual claims and add inline citations before publishing.\n\n" : ""}# ${draft.title}\n\nMeta description: ${draft.meta_description}\n\n${draft.article_markdown}\n\n## Research sources\n\n${draft.sources.map(source => `- ${source.title}: ${source.url}`).join('\n')}\n\n## Social drafts\n\n${draft.social_posts.map(post => `### ${post.platform}\n\n${post.text}`).join('\n\n')}`;
}

import { supabase } from '../lib/supabase';

export interface BriefFact {
  id: string; claim: string; status: 'proposed' | 'approved' | 'revoked' | 'retired';
  last_confirmed_at: string; review_due_at: string; reviewer_id: string | null; approved_at: string | null; offering_ids: string[];
  evidence: { id: string; source_url: string; title: string; captured_at: string; excerpt: string | null; record_reference: string | null }[];
}
export interface BriefContent {
  offerings: { id: string; name: string; type: string; source_url: string; availability: 'available' | 'limited' | 'unavailable' | 'unknown'; markets: string[] }[];
  audiences: { id: string; description: string; needs: string[]; offering_ids: string[]; exclusions: string[] }[];
  priorities: { id: string; outcome: string; weight: number | null; starts_at: string | null; ends_at: string | null }[];
  voice: { tone: string; examples: string[]; preferred_terms: string[]; avoided_terms: string[]; channel_rules: string[] };
  facts: BriefFact[];
  restrictions: { prohibited_claims: string[]; required_caveats: string[]; disallowed_topics: string[]; review_conditions: string[] };
  research_context: { markets: string[]; languages: string[]; topic_seeds: string[]; competitors: string[]; source_preferences: string[]; seasonal_context: string[] };
  content_context: { canonical_urls: string[]; allowed_channels: string[]; calls_to_action: { label: string; url: string }[] };
}
export interface BriefVersion extends BriefContent {
  schema_version: 1; id: string; version_id: string; version: number;
  brand_id: string; branch_id: string; project_id: string; status: 'draft' | 'review' | 'approved' | 'retired';
  author_id: string; created_at: string; updated_at: string; reviewer_id: string | null; approved_at: string | null; supersedes_version_id: string | null;
}
export interface BriefReadiness { ready: boolean; issues: { code: string; path: string; message: string; severity: string }[] }
export interface BriefSnapshot {
  brands: { id: string; name: string }[];
  scope: { project_id: string; brand_id: string; branch_id: string } | null;
  current: BriefVersion | null; versions: { brief: BriefVersion }[];
  can_manage: boolean; can_approve: boolean;
  readiness?: { research: BriefReadiness; drafting: BriefReadiness };
}

export function emptyBriefContent(): BriefContent {
  return { offerings: [], audiences: [], priorities: [], facts: [],
    voice: { tone: '', examples: [], preferred_terms: [], avoided_terms: [], channel_rules: [] },
    restrictions: { prohibited_claims: [], required_caveats: [], disallowed_topics: [], review_conditions: [] },
    research_context: { markets: [], languages: [], topic_seeds: [], competitors: [], source_preferences: [], seasonal_context: [] },
    content_context: { canonical_urls: [], allowed_channels: [], calls_to_action: [] } };
}

export function briefContent(version: BriefVersion): BriefContent {
  return structuredClone(Object.fromEntries(Object.keys(emptyBriefContent()).map(key => [key, version[key as keyof BriefContent]]))) as unknown as BriefContent;
}

export async function opportunityBriefRequest(projectId: string, action: 'list' | 'save' | 'approve', payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<BriefSnapshot> {
  const { data, error } = await supabase.functions.invoke('opportunity-briefs', {
    body: { ...payload, project_id: projectId, action }, signal,
  });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const detail = response ? await response.clone().json().catch(() => null) : null;
    if ((response?.status === 404 && detail?.code !== 'not_found') || detail?.code === 'setup_required' || detail?.code === 'unavailable') {
      throw new Error('Brand brief storage is not installed yet. Deploy the reviewed opportunity-briefs backend and migration before saving. No local approval has been created.');
    }
    const issues = Array.isArray(detail?.issues) ? detail.issues.map((issue: { path?: string; message?: string }) => `${issue.path || 'Brief'}: ${issue.message || 'Invalid value'}`).join('; ') : '';
    throw new Error([detail?.error, issues].filter(Boolean).join(' — ') || 'Brand brief request failed. Check your connection and access, then reload saved state before retrying.');
  }
  if (data?.error) throw new Error(data.error);
  if (action !== 'list') {
    if (!data?.brief?.version_id) throw new Error('Save response could not be verified. Reload saved state before retrying.');
    return opportunityBriefRequest(projectId, 'list', { brand_id: payload.brand_id }, signal);
  }
  if (!data || !Array.isArray(data.brands) || !Array.isArray(data.versions)) throw new Error('Brand brief backend returned an unsupported response. No changes were accepted locally.');
  return data as BriefSnapshot;
}

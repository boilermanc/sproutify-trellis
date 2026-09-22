import { radarRequest, type RadarSource } from './contentTrendRadarService';

export interface KeywordResearchItem {
  id: string;
  phrase: string;
  country: string;
  language: string;
  context: string;
  research_summary: string;
  status: 'new' | 'investigating' | 'approved' | 'dismissed';
  approved_opportunity_id: string | null;
  evidence: { label: string; captured_at: string; sources: RadarSource[]; search_entry_point?: string };
  created_at: string;
}

export async function keywordRequest<T>(projectId: string, action: string, payload: Record<string, unknown> = {}) {
  return radarRequest<T>(projectId, action, payload);
}

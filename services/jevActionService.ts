import { supabase } from '../lib/supabase';

export interface RankableBusinessAction {
  id: string;
  title: string;
  detail: string;
  owner: string;
  effort: string;
}

export async function rankBusinessActions(candidates: RankableBusinessAction[]): Promise<string[]> {
  if (!candidates.length) return [];
  const { data, error } = await supabase.functions.invoke('jev-rank-actions', { body: { candidates } });
  if (error || !Array.isArray(data?.ranked_ids)) return [];
  return data.ranked_ids.filter((id: unknown): id is string => typeof id === 'string');
}


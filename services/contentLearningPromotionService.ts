import { supabase } from '../lib/supabase';

export type LearningConfidence = 'low' | 'medium' | 'high';

export interface ContentLearningPromotion {
  id: string;
  project_id: string;
  learning_id: string;
  experiment_id: string;
  post_id: string;
  evidence_event_ids: string[];
  finding: string;
  confidence: LearningConfidence;
  conditions: string;
  application: string;
  approved_by: string;
  approved_at: string;
}

export interface LearningPromotionInput {
  projectId: string;
  learningId: string;
  experimentId: string;
  postId: string;
  evidenceEventIds: string[];
  finding: string;
  confidence: LearningConfidence;
  conditions: string;
  application: string;
}

function normalizeLearning(row: any): ContentLearningPromotion {
  return {
    ...row,
    evidence_event_ids: Array.isArray(row.evidence_event_ids) ? row.evidence_event_ids.map(String) : [],
  } as ContentLearningPromotion;
}

export async function fetchContentLearningPromotions(projectId: string): Promise<ContentLearningPromotion[]> {
  const { data, error } = await supabase
    .from('content_intelligence_learnings')
    .select('id, project_id, learning_id, experiment_id, post_id, evidence_event_ids, finding, confidence, conditions, application, approved_by, approved_at')
    .eq('project_id', projectId)
    .order('approved_at', { ascending: false });

  if (error) throw new Error(`Could not load approved learnings: ${error.message}`);
  return (data || []).map(normalizeLearning);
}

export async function approveContentLearning(input: LearningPromotionInput): Promise<ContentLearningPromotion> {
  if (!input.learningId.trim()) throw new Error('A stable learning ID is required.');
  if (!input.experimentId || !input.postId) throw new Error('A reviewed experiment with an approved post is required.');
  if (input.evidenceEventIds.length === 0) throw new Error('Select at least one performance event as evidence.');
  if (input.finding.trim().length < 10) throw new Error('Describe the bounded finding in at least 10 characters.');
  if (!input.conditions.trim() || !input.application.trim()) throw new Error('Conditions and next-use guidance are required.');

  const { data, error } = await supabase.rpc('approve_content_learning', {
    p_project_id: input.projectId,
    p_learning_id: input.learningId.trim(),
    p_experiment_id: input.experimentId,
    p_post_id: input.postId,
    p_evidence_event_ids: [...new Set(input.evidenceEventIds)],
    p_finding: input.finding.trim(),
    p_confidence: input.confidence,
    p_conditions: input.conditions.trim(),
    p_application: input.application.trim(),
  });

  if (error) throw new Error(`Could not approve learning: ${error.message}`);
  if (!data) throw new Error('The approval completed without returning a learning record.');
  return normalizeLearning(data);
}

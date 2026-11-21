import { supabase } from '../lib/supabase';
import type { ContentExperiment } from './contentIntelligenceRegistry';

export type ExperimentResultClassification = 'supported' | 'mixed' | 'unsupported' | 'inconclusive';

export interface HubContentExperiment extends ContentExperiment {
  review_due_at: string;
  result_classification: ExperimentResultClassification | null;
  result_summary: string | null;
  reviewed_by: string | null;
}

export interface RegisterExperimentInput {
  projectId: string;
  experimentId: string;
  topicId: string;
  postId: string;
  hypothesis: string;
  successMetrics: string[];
  evaluationWindowDays: number;
}

function normalizeExperiment(row: any): HubContentExperiment {
  let metrics = row.success_metrics;
  if (typeof metrics === 'string') {
    try { metrics = JSON.parse(metrics); } catch { metrics = []; }
  }
  return {
    ...row,
    success_metrics: Array.isArray(metrics) ? metrics.map(String) : [],
    reviewed_at: row.reviewed_at || '',
  } as HubContentExperiment;
}

export async function fetchHubContentExperiments(projectId: string): Promise<HubContentExperiment[]> {
  const { data, error } = await supabase
    .from('content_intelligence_experiments')
    .select('project_id, experiment_id, topic_id, post_id, hypothesis, success_metrics, evaluation_window_days, review_due_at, status, result_classification, result_summary, reviewed_by, reviewed_at, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load Hub experiments: ${error.message}`);
  return (data || []).map(normalizeExperiment);
}

export async function registerHubContentExperiment(input: RegisterExperimentInput): Promise<HubContentExperiment> {
  const metrics = [...new Set(input.successMetrics.map(metric => metric.trim()).filter(Boolean))];
  if (!input.experimentId.trim()) throw new Error('A stable experiment ID is required.');
  if (input.hypothesis.trim().length < 10) throw new Error('Write a measurable hypothesis of at least 10 characters.');
  if (metrics.length === 0) throw new Error('Add at least one success metric.');
  if (!Number.isInteger(input.evaluationWindowDays) || input.evaluationWindowDays < 1 || input.evaluationWindowDays > 365) throw new Error('The evaluation window must be between 1 and 365 days.');

  const { data, error } = await supabase.rpc('register_content_experiment', {
    p_project_id: input.projectId,
    p_experiment_id: input.experimentId.trim(),
    p_topic_id: input.topicId,
    p_post_id: input.postId,
    p_hypothesis: input.hypothesis.trim(),
    p_success_metrics: metrics,
    p_evaluation_window_days: input.evaluationWindowDays,
  });
  if (error) throw new Error(`Could not register experiment: ${error.message}`);
  return normalizeExperiment(data);
}

export async function reviewHubContentExperiment(input: {
  projectId: string;
  experimentId: string;
  classification: ExperimentResultClassification;
  summary: string;
}): Promise<HubContentExperiment> {
  if (input.summary.trim().length < 10) throw new Error('Summarize the observed result in at least 10 characters.');
  const { data, error } = await supabase.rpc('review_content_experiment', {
    p_project_id: input.projectId,
    p_experiment_id: input.experimentId,
    p_result_classification: input.classification,
    p_result_summary: input.summary.trim(),
  });
  if (error) throw new Error(`Could not review experiment: ${error.message}`);
  return normalizeExperiment(data);
}

import { ContentExperiment, ContentPost } from './contentIntelligenceRegistry';

export type ExperimentReviewStatus = 'reviewed' | 'unlinked' | 'upcoming' | 'due' | 'overdue';

export interface ExperimentReviewState {
  status: ExperimentReviewStatus;
  dueAt: string | null;
  daysFromDue: number | null;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getExperimentReviewState(
  experiment: ContentExperiment,
  posts: ContentPost[],
  now = new Date(),
): ExperimentReviewState {
  if (experiment.status === 'reviewed') {
    return { status: 'reviewed', dueAt: experiment.reviewed_at || null, daysFromDue: null, label: 'Reviewed' };
  }

  const linkedPost = posts.find(post => post.post_id === experiment.post_id);
  const baseline = linkedPost?.published_at || experiment.created_at;
  const baselineDate = new Date(baseline);
  if (!baseline || Number.isNaN(baselineDate.valueOf())) {
    return { status: 'unlinked', dueAt: null, daysFromDue: null, label: 'Needs publication date' };
  }

  const due = new Date(baselineDate.getTime() + experiment.evaluation_window_days * DAY_MS);
  const daysFromDue = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  if (daysFromDue < 0) return { status: 'overdue', dueAt: due.toISOString(), daysFromDue, label: `${Math.abs(daysFromDue)}d overdue` };
  if (daysFromDue === 0) return { status: 'due', dueAt: due.toISOString(), daysFromDue, label: 'Review due today' };
  return { status: 'upcoming', dueAt: due.toISOString(), daysFromDue, label: `Review in ${daysFromDue}d` };
}

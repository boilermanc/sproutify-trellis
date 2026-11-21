import { BranchContext } from '../types';
import { fetchPosthogAnalytics, fetchPosthogConnections } from './posthogService';
import { answerPosthogQuestion, type PosthogConversation } from './sagePosthogReporting.mjs';

export type { PosthogConversation } from './sagePosthogReporting.mjs';

export function answerPosthogAnalyticsQuestion(
  question: string,
  branchContext?: BranchContext,
  previous?: PosthogConversation | null,
) {
  return answerPosthogQuestion(question, {
    allBranches: branchContext?.allBranches,
    activeBranchSlugs: branchContext?.activeBranchSlugs,
    isAllSelected: branchContext?.isAllSelected,
    previous,
  }, {
    listConnections: fetchPosthogConnections,
    fetchAnalytics: fetchPosthogAnalytics,
  });
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardService = await readFile(new URL('../services/dashboardService.ts', import.meta.url), 'utf8');
const standup = await readFile(new URL('../components/dashboard/MorningStandup.tsx', import.meta.url), 'utf8');
const creativeStudio = await readFile(new URL('../pages/VideoAdLab.tsx', import.meta.url), 'utf8');
const postScheduler = await readFile(new URL('../pages/PostScheduler.tsx', import.meta.url), 'utf8');

test('dashboard excludes Card Studio background jobs from human review work', () => {
  assert.match(dashboardService, /requestPayload\.purpose === 'card_background'/);
  assert.match(dashboardService, /actionLabel: 'Review'/);
});

test('dashboard review links honor the explicitly selected header branch', () => {
  assert.match(standup, /searchParams\.set\('reviewBranch', item\.branchSlug\)/);
  assert.match(standup, /searchParams\.set\('composeBranch', item\.branchSlug\)/);
  assert.match(creativeStudio, /job\.branch === reviewQueueBranch/);
  assert.match(creativeStudio, /reviewQueueBranch === selectedBranchSlug/);
  assert.match(creativeStudio, /setTrackedJobId\(target\.id\)/);
  assert.match(creativeStudio, /getVideoAdJobs\(selectedBranchSlug, 100\)/);
  assert.match(postScheduler, /b\.slug === selectedBranchSlug/);
});

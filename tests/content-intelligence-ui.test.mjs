import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('Content Intelligence is a first-class routed navigation destination', () => {
  assert.match(read('types.ts'), /'content-intelligence'/);
  assert.match(read('components/Layout.tsx'), /Content Intelligence/);
  const app = read('App.tsx');
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/pages\/ContentIntelligence'\)\)/);
  assert.match(app, /case 'content-intelligence'[\s\S]*<FeatureErrorBoundary[\s\S]*<React\.Suspense[\s\S]*<ContentIntelligence/);
  assert.match(read('components/FeatureErrorBoundary.tsx'), /Trellis is still running/);
  assert.match(read('src/data/pageInfo.ts'), /'content-intelligence'/);
});

test('the registry discovers project partitions instead of hardcoding supported branches', () => {
  const registry = read('services/contentIntelligenceRegistry.ts');
  assert.match(registry, /import\.meta\.glob\('\.\.\/\.trellis\/knowledge\/projects\/\*\/\*\.jsonl'/);
  assert.match(registry, /import\.meta\.glob\('\.\.\/\.trellis\/spec\/projects\/\*\/\*\.md'/);
  assert.doesNotMatch(registry, /\['rejoice',\s*'rekkrd'\]/);
});

test('the page exposes the complete closed-loop content record set', () => {
  const page = read('pages/ContentIntelligence.tsx');
  for (const label of ['How It Works', 'Topics', 'Assets', 'Experiments', 'Performance', 'Learnings', 'New Task']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /navigator\.clipboard\.writeText\(command\)/);
  assert.match(page, /create-project --project/);
  assert.match(page, /npm run content -- validate/);
});

test('the Help Center and contextual flyout document the operating workflow', () => {
  const helpContent = read('src/data/helpContent.ts');
  const contextualHelp = read('components/ContextAwareHelp.tsx');
  assert.match(helpContent, /art_content_intelligence_guide/);
  assert.match(helpContent, /The Seven-Step Workflow/);
  assert.match(contextualHelp, /'content-intelligence'/);
  assert.match(contextualHelp, /art_content_intelligence_guide/);
});

test('published Scheduler rows are reconciled before canonical registration', () => {
  const service = read('services/contentPublicationReconciliationService.ts');
  const page = read('pages/ContentIntelligence.tsx');
  assert.match(service, /fetchScheduledPosts\(\{ branchSlug: projectId, status: 'published' \}\)/);
  assert.match(service, /isPublishedPostRegistered/);
  assert.match(service, /source_record_id/);
  assert.match(service, /external_post_id/);
  assert.match(page, /Published assets awaiting canonical registration/);
  assert.match(page, /Nothing is registered without review/);
  assert.match(page, /Copy CLI fallback/);
});

test('reviewers can atomically approve a publication and its project topic', () => {
  const service = read('services/contentRegistrationService.ts');
  const page = read('pages/ContentIntelligence.tsx');
  const migration = read('supabase/migrations/20260818215636_content_intelligence_post_registrations.sql');
  assert.match(service, /rpc\('approve_content_registration'/);
  assert.match(service, /requireHttpsUrl/);
  assert.match(page, /Approve & register/);
  assert.match(page, /Create a new topic/);
  assert.match(migration, /create table if not exists public\.content_intelligence_topics/);
  assert.match(migration, /create table if not exists public\.content_intelligence_posts/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /private\.can_manage_marketing/);
  assert.match(migration, /revoke all on table public\.content_intelligence_posts from anon, authenticated/);
  assert.match(migration, /grant select, insert on table public\.content_intelligence_posts to authenticated/);
});

test('approved publications import append-only social insight history inside the isolated feature', () => {
  const service = read('services/contentPerformanceImportService.ts');
  const page = read('pages/ContentIntelligence.tsx');
  assert.match(service, /from\('social_post_insights'\)/);
  assert.match(service, /\.in\('scheduled_post_id', chunk\)/);
  assert.match(service, /\.range\(from, from \+ 999\)/);
  assert.match(service, /event_id: `social_insight_\$\{row\.id\}`/);
  assert.match(service, /linkedExperiments\.length === 1/);
  assert.match(page, /Automated platform history/);
  assert.match(page, /Refresh snapshots/);
});

test('running experiments expose deterministic review reminders', () => {
  const service = read('services/contentExperimentReviewService.ts');
  const page = read('pages/ContentIntelligence.tsx');
  assert.match(service, /linkedPost\?\.published_at \|\| experiment\.created_at/);
  assert.match(service, /Review due today/);
  assert.match(service, /daysFromDue < 0/);
  assert.match(service, /Needs publication date/);
  assert.match(page, /getExperimentReviewState\(experiment, posts\)/);
  assert.match(page, /<CalendarClock/);
});

test('durable learnings require operator approval and explicit evidence', () => {
  const service = read('services/contentLearningPromotionService.ts');
  const page = read('pages/ContentIntelligence.tsx');
  const migration = read('supabase/migrations/20260818233500_content_intelligence_learning_promotions.sql');
  assert.match(service, /rpc\('approve_content_learning'/);
  assert.match(service, /Select at least one performance event as evidence/);
  assert.match(page, /Human approval gate/);
  assert.match(page, /Approve durable learning/);
  assert.match(page, /experiment\.status === 'reviewed'/);
  assert.match(migration, /create table if not exists public\.content_intelligence_learnings/);
  assert.match(migration, /jsonb_array_length\(evidence_event_ids\) > 0/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /private\.can_manage_marketing/);
  assert.match(migration, /revoke all on table public\.content_intelligence_learnings from anon, authenticated/);
  assert.match(migration, /grant select, insert on table public\.content_intelligence_learnings to authenticated/);
});

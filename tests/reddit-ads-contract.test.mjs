import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Reddit navigation and page are ads-first, not organic posting', () => {
  const layout = read('components/Layout.tsx');
  const page = read('pages/RedditGrowth.tsx');

  assert.match(layout, /id: 'reddit-growth', label: 'Reddit Ads'/);
  assert.match(page, />Reddit Ads</);
  assert.doesNotMatch(page, /reddit-post-comment|reddit-review-stage|GoogleGenAI|MOCK_DISCOVERED_COMMENTS/);
});

test('phase-one campaign state is empty, local, and never claims deployment', () => {
  const page = read('pages/RedditGrowth.tsx');

  assert.match(page, /trellis_reddit_ad_campaigns_v1/);
  assert.match(page, /deployment_status: 'not_deployed'/);
  assert.match(page, /Nothing was deployed/);
  assert.match(page, /Deployment intentionally disabled/);
  assert.doesNotMatch(page, /status: 'deployed'/);
});

test('review readiness requires destination, creative, and conversion tracking', () => {
  const page = read('pages/RedditGrowth.tsx');

  assert.match(page, /validHttpUrl\(variant\.landingUrl\)/);
  assert.match(page, /attach an approved creative URL/);
  assert.match(page, /objective === 'conversions'.*conversionPixelId/);
  assert.match(page, /status: 'pending_review'/);
  assert.match(page, /status === 'approved'/);
});

test('future deployment contract requires provider identifiers', () => {
  const types = read('types.ts');

  assert.match(types, /provider: 'reddit'/);
  assert.match(types, /campaignId: string/);
  assert.match(types, /adGroupId: string/);
  assert.match(types, /adIds: string\[\]/);
  assert.match(types, /deployment\?: RedditAdDeployment/);
});

test('ad strategist separates evidence, assumptions, approval, and campaign creation', () => {
  const page = read('pages/RedditGrowth.tsx');
  const service = read('services/redditAdStrategyService.ts');
  const types = read('types.ts');

  assert.match(page, /Ad Strategist/);
  assert.match(page, /Product and Website Evidence/);
  assert.match(page, /Approve Strategy/);
  assert.match(page, /Create Paused Draft/);
  assert.match(page, /status !== 'approved'/);
  assert.match(service, /generateText\(apiKeys/);
  assert.match(service, /A URL is an identifier, not permission to claim you inspected its contents/);
  assert.match(service, /Do not invent prices, trial terms, testimonials/);
  assert.match(types, /RedditAdStrategyStatus = 'draft' \| 'generated' \| 'approved'/);
});

test('strategy creatives are editable and unsupported claims block approval', () => {
  const page = read('pages/RedditGrowth.tsx');
  const service = read('services/redditAdStrategyService.ts');

  assert.match(page, /updateStrategyCreative/);
  assert.match(page, /Resolve Before Approval/);
  assert.match(page, /EVIDENCE_REQUIRED_CLAIMS/);
  assert.match(page, /no data loss/);
  assert.match(page, /automatic/);
  assert.match(page, /disabled=\{strategyErrors\.length > 0\}/);
  assert.match(service, /Every factual assertion in ad copy must be directly supported/);
  assert.match(service, /locationTargets: strings\(item\.locationTargets, 1\)/);
  assert.match(service, /temperature: 0\.3/);
});

test('creative variants can generate, preview, and attach assets without leaving the form', () => {
  const page = read('pages/RedditGrowth.tsx');
  const cardStudio = read('pages/CardStudio.tsx');
  const directions = read('services/brandCreativeDirections.ts');

  assert.match(page, /Inline Creative Builder/);
  assert.match(page, /generateInlineCreative/);
  assert.match(page, /renderCardPreviewDataUrl/);
  assert.match(page, /Approve & Attach/);
  assert.match(page, /uploadPostImage/);
  assert.match(page, /It does not save or submit the campaign/);
  assert.match(page, /getBrandCreativeDirectionForIndex/);
  assert.match(page, /generateCreativeBackground/);
  assert.match(page, /Brand Creative Direction/);
  assert.match(page, /Click to expand/);
  assert.match(page, /Expanded creative preview/);
  assert.match(cardStudio, /Brand creative direction/);
  assert.match(cardStudio, /buildCreativeDirectionBrief/);
  assert.match(directions, /Vinyl Ritual/);
  assert.match(directions, /Listening Room/);
  assert.match(directions, /Collection Detail/);
  assert.match(directions, /Connected Collection/);
  assert.match(directions, /Joy Worth Noticing/);
  assert.match(directions, /Curious About Scripture/);
  assert.match(directions, /Everyday Wisdom/);
  assert.match(directions, /Growing in Faith/);
  assert.match(directions, /Peace for Today/);
  assert.match(directions, /When Life Feels Heavy/);
  assert.match(directions, /Avoid defaulting to sadness/);
  assert.match(cardStudio, /Standard Card Studio/);
  assert.match(cardStudio, /including verified scripture cards/);
  assert.match(directions, /Do not add product claims/);
});

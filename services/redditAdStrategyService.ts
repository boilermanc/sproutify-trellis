import {
  ApiKeyConfig,
  RedditAdObjective,
  RedditAdStrategyCreative,
} from '../types';
import { generateText } from './aiService';

export interface RedditAdStrategyInput {
  brandName: string;
  branchSlug: string;
  websiteUrl: string;
  productName: string;
  productEvidence: string;
}

export interface RedditAdStrategyRecommendation {
  offerName: string;
  rationale: string;
  objective: RedditAdObjective;
  landingPageUrl: string;
  targetAudience: string;
  communityTargets: string[];
  locationTargets: string[];
  recommendedDailyBudgetUsd: number;
  creatives: RedditAdStrategyCreative[];
  risks: string[];
  assumptions: string[];
}

const ALLOWED_OBJECTIVES: RedditAdObjective[] = ['awareness', 'traffic', 'conversions', 'video_views'];

function parseJson(text: string): unknown {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

function strings(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim())
    .slice(0, max);
}

function normalizeRecommendation(value: unknown, input: RedditAdStrategyInput): RedditAdStrategyRecommendation {
  if (!value || typeof value !== 'object') throw new Error('AI returned an invalid strategy.');
  const item = value as Record<string, unknown>;
  const objective = ALLOWED_OBJECTIVES.includes(item.objective as RedditAdObjective)
    ? item.objective as RedditAdObjective
    : 'traffic';
  const creatives = Array.isArray(item.creatives)
    ? item.creatives.slice(0, 3).map((creative): RedditAdStrategyCreative => {
        const record = creative && typeof creative === 'object' ? creative as Record<string, unknown> : {};
        return {
          headline: String(record.headline || '').trim(),
          body: String(record.body || '').trim(),
          callToAction: String(record.callToAction || 'Learn More').trim(),
          angle: String(record.angle || '').trim(),
        };
      }).filter(creative => creative.headline && creative.body)
    : [];

  return {
    offerName: String(item.offerName || input.productName || `${input.brandName} introductory offer`).trim(),
    rationale: String(item.rationale || '').trim(),
    objective,
    landingPageUrl: String(item.landingPageUrl || input.websiteUrl || '').trim(),
    targetAudience: String(item.targetAudience || '').trim(),
    communityTargets: strings(item.communityTargets),
    locationTargets: strings(item.locationTargets, 1),
    recommendedDailyBudgetUsd: Math.max(1, Number(item.recommendedDailyBudgetUsd) || 25),
    creatives,
    risks: strings(item.risks, 6),
    assumptions: strings(item.assumptions, 6),
  };
}

export async function generateRedditAdStrategy(
  apiKeys: ApiKeyConfig,
  input: RedditAdStrategyInput,
): Promise<RedditAdStrategyRecommendation> {
  const result = await generateText(apiKeys, {
    systemPrompt: `You are Trellis Ad Strategist. Build conservative, testable paid Reddit campaign strategies.

Evidence rules:
- Treat only the supplied product evidence as factual. A URL is an identifier, not permission to claim you inspected its contents.
- Every factual assertion in ad copy must be directly supported by the supplied evidence.
- Never add absolute or implied guarantees such as “no data loss,” “guaranteed,” “secure,” “automatic,” or “free” unless that exact capability or term is explicitly supported by the evidence.
- If a useful claim is not supported, omit it from the creative and list it under assumptions instead.

Testing rules:
- Recommend exactly one location for the first test; default to United States when no market is supplied.
- Separate facts from assumptions.
- Recommend communities as targeting hypotheses, not permission to spam or post organically.
- Return only valid JSON.`,
    prompt: `Create a first-test Reddit Ads strategy for this brand.

Brand: ${input.brandName}
Branch slug: ${input.branchSlug}
Website or candidate landing page: ${input.websiteUrl || 'Not supplied'}
Product or offer: ${input.productName || 'Not supplied'}
Product and website evidence:
${input.productEvidence || 'No product evidence supplied. Make cautious assumptions and list every one.'}

Return this exact JSON shape:
{
  "offerName": "specific offer being advertised",
  "rationale": "why this is the best first test",
  "objective": "awareness|traffic|conversions|video_views",
  "landingPageUrl": "best supplied destination URL or empty string",
  "targetAudience": "plain-language audience definition",
  "communityTargets": ["subreddit name without r/"],
  "locationTargets": ["exactly one country or region"],
  "recommendedDailyBudgetUsd": 25,
  "creatives": [
    {"headline":"...","body":"...","callToAction":"Learn More","angle":"..."}
  ],
  "risks": ["..."],
  "assumptions": ["..."]
}

Provide three distinct creative concepts. Keep headlines under 100 characters. Use neutral, reversible language suitable for an early test. Do not invent prices, trial terms, testimonials, performance claims, data-safety guarantees, automation behavior, or product capabilities.`,
    maxTokens: 2200,
    temperature: 0.3,
  });

  if (result.error || !result.text) {
    throw new Error(result.error || 'The AI provider returned an empty strategy.');
  }

  try {
    return normalizeRecommendation(parseJson(result.text), input);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'AI returned an invalid strategy.');
  }
}

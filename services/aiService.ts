import { Profile, ChatMessage, LlmProvider, Ticket, ApiKeyConfig, ComplianceResult } from "../types";

// ============================================================================
// Multi-Provider AI Service (uses API keys from Supabase settings)
// ============================================================================

interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface GenerateResult {
  text: string;
  provider: LlmProvider;
  error?: string;
}

// gemini-1.5-flash was retired by Google; use the current flash model (same one the Social Hub Lab uses).
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function generateWithGeminiRest(apiKey: string, options: GenerateOptions): Promise<string> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        ...(options.systemPrompt ? [{ role: 'user', parts: [{ text: options.systemPrompt }] }] : []),
        { role: 'user', parts: [{ text: options.prompt }] }
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateWithOpenAI(apiKey: string, options: GenerateOptions): Promise<string> {
  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithAnthropic(apiKey: string, options: GenerateOptions): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: options.maxTokens || 1024,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

export async function generateText(apiKeys: ApiKeyConfig, options: GenerateOptions): Promise<GenerateResult> {
  const provider = apiKeys.active_llm;

  // Sanitize all user-facing prompt content before sending to LLM
  const sanitizedOptions: GenerateOptions = {
    ...options,
    prompt: sanitizePII(options.prompt),
  };

  try {
    let text: string;

    switch (provider) {
      case 'gemini':
        if (!apiKeys.gemini_api_key) throw new Error('Gemini API key not configured');
        text = await generateWithGeminiRest(apiKeys.gemini_api_key, sanitizedOptions);
        break;
      case 'openai':
        if (!apiKeys.openai_api_key) throw new Error('OpenAI API key not configured');
        text = await generateWithOpenAI(apiKeys.openai_api_key, sanitizedOptions);
        break;
      case 'anthropic':
        if (!apiKeys.anthropic_api_key) throw new Error('Anthropic API key not configured');
        text = await generateWithAnthropic(apiKeys.anthropic_api_key, sanitizedOptions);
        break;
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }

    return { text, provider };
  } catch (error) {
    return {
      text: '',
      provider,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function generateTicketDraft(apiKeys: ApiKeyConfig, subject: string, description: string): Promise<GenerateResult> {
  return generateText(apiKeys, {
    systemPrompt: `You are a helpful customer support agent for Sproutify. Write professional, friendly responses that resolve customer issues efficiently. Keep responses concise but thorough.`,
    prompt: `Write a draft response for this support ticket:\n\nSubject: ${subject}\n\nCustomer Message: ${description}`,
    maxTokens: 512,
    temperature: 0.7,
  });
}

export async function generateCampaignCopy(apiKeys: ApiKeyConfig, brief: string, tone: string): Promise<GenerateResult> {
  return generateText(apiKeys, {
    systemPrompt: `You are a marketing copywriter. Write compelling, on-brand content that drives engagement. Match the requested tone exactly.`,
    prompt: `Write marketing copy for: ${brief}\n\nTone: ${tone}`,
    maxTokens: 1024,
    temperature: 0.8,
  });
}

export async function generateSocialPost(apiKeys: ApiKeyConfig, topic: string, platform: string): Promise<GenerateResult> {
  const platformLimits: Record<string, string> = {
    instagram: 'Keep under 2200 characters. Include relevant hashtags.',
    x: 'Keep under 280 characters. Be punchy and engaging.',
    linkedin: 'Professional tone. Can be longer form, up to 3000 characters.',
  };

  return generateText(apiKeys, {
    systemPrompt: `You are a social media manager for Sproutify. Create engaging posts optimized for each platform.`,
    prompt: `Write a ${platform} post about: ${topic}\n\n${platformLimits[platform] || ''}`,
    maxTokens: 512,
    temperature: 0.8,
  });
}

// ============================================================================
// PII Sanitization
// ============================================================================

/**
 * Strips PII (Credit Cards, SSNs, Tokens) from text before LLM calls or storage.
 */
export const sanitizePII = (text: string): string => {
  const ccRegex = /\b(?:\d{4}[ -]?){3}(?=\d{4}\b)\d{4}\b/g;
  const idRegex = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
  const tokenRegex = /\b[A-Za-z0-9_-]{32,}\b/g;

  return text
    .replace(ccRegex, '[REDACTED_CC]')
    .replace(idRegex, '[REDACTED_ID]')
    .replace(tokenRegex, '[REDACTED_TOKEN]');
};

// ============================================================================
// Sage Chat (now uses multi-provider generateText)
// ============================================================================

export const chatWithSage = async (
  apiKeys: ApiKeyConfig,
  history: ChatMessage[],
  message: string,
  provider: LlmProvider = 'gemini',
  context?: { tickets: Ticket[], brandName: string, profilesCount?: number }
) => {
  const supportContext = context?.tickets.length
    ? `Ecosystem Load: ${context.tickets.length} open tickets. Profiles: ${context?.profilesCount || 'Unknown'}.`
    : "";

  const systemPrompt = `You are Sage, the Strategic Intelligence for Sproutify Trellis.
    You manage ecosystem branches: atlurbanfarms.com, micro.sproutify.app, farm.sproutify.app, school.sproutify.app, and letsrejoice.app.
    Always provide advice that links cross-branch behaviors for audience growth.
    The Campaign Builder now uses a Segment Engine with computed presets (high_value, at_risk, engaged, dormant, subscribed, multi_branch) instead of static tags.
    Tone: Sophisticated, data-driven, yet earthy.
    ${supportContext}`;

  const result = await generateText(apiKeys, {
    systemPrompt,
    prompt: message,
    maxTokens: 1024,
    temperature: 0.7,
  });

  if (result.error) {
    return `The ${provider} synchronization loop is interrupted. Please check your vault credentials.`;
  }

  return result.text?.trim() || "The orchestration engine is calibrating cross-site data. Please retry.";
};

/**
 * Generates personalized marketing email intro with fallback safety.
 */
export const generateEmailCopy = async (apiKeys: ApiKeyConfig, profile: Profile, brandName: string) => {
  const result = await generateText(apiKeys, {
    prompt: `Craft a 2-sentence marketing intro for ${profile.first_name} at ${brandName}.
    Active on: ${profile.branches.join(', ')}.
    Lifetime Value: $${profile.ltv.toFixed(2)}. Engagement: ${profile.engagement_score || 0}/100.
    Churn Risk: ${profile.churn_risk}.
    Highlight cross-spoke benefits based on which sites they use.`,
    maxTokens: 256,
    temperature: 0.8,
  });

  if (result.error) {
    return `Discover new ways to grow with ${brandName}.`;
  }

  return result.text?.trim() || `Welcome back to the unified ${brandName} ecosystem, ${profile.first_name}!`;
};

/**
 * Runs a Brand Compliance Audit via the active LLM provider.
 */
export const runBrandComplianceAudit = async (
  apiKeys: ApiKeyConfig,
  content: string,
  branchName: string,
  branchTone: string,
  branchKeywords: string[],
  platform: string
): Promise<ComplianceResult> => {
  try {
    const prompt = `You are a Brand Compliance Auditor for Sproutify Trellis.

BRAND CONTEXT:
- Branch: ${branchName}
- Brand Tone: ${branchTone}
- Brand Keywords: ${branchKeywords.join(', ')}
- Target Platform: ${platform}

CONTENT TO AUDIT:
"${content}"

Evaluate this content across exactly 5 categories. For each, return status (pass/warning/fail), a message explaining your assessment, and a suggestion if status is not "pass".

Categories:
1. tone — Does the content match the brand tone? Is it appropriate for the platform?
2. competitor_mentions — Does the content reference competitor brands or products?
3. compliance_disclaimers — Does the content need legal disclaimers (health claims, financial promises, sweepstakes rules)?
4. sensitivity — Does the content contain culturally insensitive language, exclusionary phrasing, or controversial topics?
5. brand_consistency — Does the content use brand keywords naturally? Does it align with the brand identity?

Return ONLY valid JSON in this exact shape:
{
  "overall_score": <number 0-100>,
  "status": "<approved|warning|blocked>",
  "checks": [
    {
      "category": "<tone|competitor_mentions|compliance_disclaimers|sensitivity|brand_consistency>",
      "status": "<pass|warning|fail>",
      "message": "<explanation>",
      "suggestion": "<improvement suggestion or empty string>"
    }
  ]
}

Scoring: Start at 100. Each "warning" deducts 10 points. Each "fail" deducts 25 points.
Status thresholds: >=70 = "approved", 40-69 = "warning", <40 = "blocked".`;

    const response = await generateText(apiKeys, {
      prompt,
      systemPrompt: 'You are a Brand Compliance Auditor. Return ONLY valid JSON, no markdown or commentary.',
      maxTokens: 1024,
      temperature: 0.3,
    });

    if (response.error) throw new Error(response.error);

    const result = JSON.parse(response.text || "{}");

    return {
      overall_score: result.overall_score ?? 0,
      status: result.status ?? 'blocked',
      checks: (result.checks || []).map((c: any) => ({
        category: c.category,
        status: c.status || 'fail',
        message: c.message || 'Audit check failed',
        suggestion: c.suggestion || undefined,
      })),
      audited_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      overall_score: 0,
      status: 'blocked',
      checks: [{
        category: 'tone',
        status: 'fail',
        message: 'Compliance engine offline. Cannot verify brand alignment.',
        suggestion: 'Retry the audit or publish manually after human review.',
      }],
      audited_at: new Date().toISOString(),
    };
  }
};

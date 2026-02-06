import { GoogleGenAI } from "@google/genai";
import { Profile, ChatMessage, LlmProvider, Ticket, ApiKeyConfig } from "../types";

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

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
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

  try {
    let text: string;

    switch (provider) {
      case 'gemini':
        if (!apiKeys.gemini_api_key) throw new Error('Gemini API key not configured');
        text = await generateWithGeminiRest(apiKeys.gemini_api_key, options);
        break;
      case 'openai':
        if (!apiKeys.openai_api_key) throw new Error('OpenAI API key not configured');
        text = await generateWithOpenAI(apiKeys.openai_api_key, options);
        break;
      case 'anthropic':
        if (!apiKeys.anthropic_api_key) throw new Error('Anthropic API key not configured');
        text = await generateWithAnthropic(apiKeys.anthropic_api_key, options);
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
// Legacy Sage Functions (uses @google/genai SDK with process.env)
// ============================================================================

/**
 * Strips PII (Credit Cards, SSNs, Tokens) from raw transcripts before storage.
 */
export const sanitizePII = (text: string): string => {
  // Regex for common CC formats (Luhn-like patterns)
  const ccRegex = /\b(?:\d{4}[ -]?){3}(?=\d{4}\b)\d{4}\b/g;
  // Regex for potential SSNs or sensitive ID patterns
  const idRegex = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
  // Regex for high-entropy tokens or long keys
  const tokenRegex = /\b[A-Za-z0-9_-]{32,}\b/g;

  return text
    .replace(ccRegex, '[REDACTED_CC]')
    .replace(idRegex, '[REDACTED_ID]')
    .replace(tokenRegex, '[REDACTED_TOKEN]');
};

/**
 * Orchestrates a strategic conversation with Sage using Gemini 3 Pro.
 * Optimized for production with thinking budgets and error resilience.
 */
export const chatWithSage = async (
  history: ChatMessage[], 
  message: string, 
  provider: LlmProvider = 'gemini', 
  context?: { tickets: Ticket[], brandName: string, profilesCount?: number }
) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const supportContext = context?.tickets.length 
      ? `Ecosystem Load: ${context.tickets.length} open tickets. Profiles: ${context?.profilesCount || 'Unknown'}.`
      : "";

    const systemInstruction = `You are Sage, the Strategic Intelligence for Sproutify Trellis.
    You manage ecosystem branches: atlurbanfarms.com, micro.sproutify.app, farm.sproutify.app, school.sproutify.app, and letsrejoice.app.
    Always provide advice that links cross-branch behaviors for audience growth.
    The Campaign Builder now uses a Segment Engine with computed presets (high_value, at_risk, engaged, dormant, subscribed, multi_branch) instead of static tags.
    Tone: Sophisticated, data-driven, yet earthy.
    ${supportContext}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: message,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 2000 } 
      }
    });

    return response.text?.trim() || "The orchestration engine is calibrating cross-site data. Please retry.";
  } catch (error) {
    console.error("Sage Strategic Engine Offline:", error);
    return `The ${provider} synchronization loop is interrupted. Please check your vault credentials.`;
  }
};

/**
 * Generates personalized marketing email intro with fallback safety.
 */
export const generateEmailCopy = async (profile: Profile, brandName: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Craft a 2-sentence marketing intro for ${profile.first_name} at ${brandName}.
    Active on: ${profile.branches.join(', ')}.
    Lifetime Value: $${profile.ltv.toFixed(2)}. Engagement: ${profile.engagement_score || 0}/100.
    Churn Risk: ${profile.churn_risk}.
    Highlight cross-spoke benefits based on which sites they use.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 } 
      },
    });

    return response.text?.trim() || `Welcome back to the unified ${brandName} ecosystem, ${profile.first_name}!`;
  } catch (error) {
    return `Discover new ways to grow with ${brandName}.`;
  }
};

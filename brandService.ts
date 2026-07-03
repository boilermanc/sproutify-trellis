import { GoogleGenAI, Type } from "@google/genai";
import { BrandIdentity, BrandColorPalette, BrandTypography, GeneratedBrandAsset } from './types';
import { supabase as hubClient } from './lib/supabase';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MODELS = {
  TEXT: 'gemini-2.5-flash',      // Fast, cost-effective for text analysis
  IMAGE: 'gemini-2.0-flash'      // Image generation (if available)
} as const;

const MSHOTS_BASE = 'https://s0.wp.com/mshots/v1/';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getAIClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
  }
  return new GoogleGenAI({ apiKey });
}

function formatUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getScreenshotUrl(websiteUrl: string): string {
  return `${MSHOTS_BASE}${encodeURIComponent(websiteUrl)}?w=1280&h=960`;
}

function safeParseJSON<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('JSON parse error:', err);
    return fallback;
  }
}

// Grounded (Google Search) responses can't use responseSchema, so the model
// returns free text that may wrap the JSON in ```fences``` or prose. Pull the
// JSON object out defensively.
function extractJSON<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith('{')) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last > first) s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch (err) {
    console.error('JSON parse error (grounded):', err);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════
// BRAND EXTRACTION
// ═══════════════════════════════════════════════════════════════

interface ExtractedBrandData {
  name: string;
  tagline: string;
  mission: string;
  values: string[];
  targetAudience: string;
  voice: string;
  colorPalette: BrandColorPalette;
  typography: BrandTypography;
  imagePrompt: string;
  marketingHooks: string[];
  sitePreviewDescription: string;
}

const EMPTY_BRAND_DATA: ExtractedBrandData = {
  name: '',
  tagline: '',
  mission: '',
  values: [],
  targetAudience: '',
  voice: '',
  colorPalette: { primary: '#000000', secondary: '#666666', accent: '#0066cc', neutral: '#f5f5f5' },
  typography: { heading: 'Inter', body: 'Inter' },
  imagePrompt: '',
  marketingHooks: [],
  sitePreviewDescription: ''
};

// Shape returned by the scrape-site Edge Function.
interface ScrapedSite {
  url: string;
  title: string;
  description: string;
  themeColor: string;
  ogImage: string;
  colors: string[];
  fonts: string[];
  text: string;
  error?: string;
}

// Reusable response schema for the (non-grounded) accurate path.
const BRAND_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    tagline: { type: Type.STRING },
    mission: { type: Type.STRING },
    values: { type: Type.ARRAY, items: { type: Type.STRING } },
    targetAudience: { type: Type.STRING },
    voice: { type: Type.STRING },
    colorPalette: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING },
        secondary: { type: Type.STRING },
        accent: { type: Type.STRING },
        neutral: { type: Type.STRING },
      },
      required: ['primary', 'secondary', 'accent', 'neutral'],
    },
    typography: {
      type: Type.OBJECT,
      properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ['heading', 'body'],
    },
    imagePrompt: { type: Type.STRING },
    marketingHooks: { type: Type.ARRAY, items: { type: Type.STRING } },
    sitePreviewDescription: { type: Type.STRING },
  },
  required: ['name', 'tagline', 'mission', 'values', 'targetAudience', 'voice', 'colorPalette', 'typography', 'imagePrompt', 'marketingHooks'],
};

function buildBrand(
  branchId: string,
  formattedUrl: string,
  data: ExtractedBrandData,
  site: ScrapedSite | null,
): Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'> {
  return {
    branch_id: branchId,
    name: data.name || site?.title || 'Unnamed Brand',
    tagline: data.tagline || '',
    mission: data.mission || '',
    values: Array.isArray(data.values) ? data.values : [],
    target_audience: data.targetAudience || '',
    voice: data.voice || '',
    website_url: formattedUrl,
    screenshot_url: getScreenshotUrl(formattedUrl),
    color_palette: data.colorPalette || EMPTY_BRAND_DATA.colorPalette,
    typography: data.typography || EMPTY_BRAND_DATA.typography,
    image_prompt: data.imagePrompt || '',
    marketing_hooks: Array.isArray(data.marketingHooks) ? data.marketingHooks : [],
    site_preview_description: data.sitePreviewDescription || '',
    extracted_images: site?.ogImage ? [site.ogImage] : [],
    status: 'draft',
  };
}

export async function extractBrandFromUrl(
  websiteUrl: string,
  branchId: string,
  apiKey: string
): Promise<Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>> {
  const ai = getAIClient(apiKey);
  const formattedUrl = formatUrl(websiteUrl);

  // 1. Server-side scrape for the REAL page content — colors, fonts, copy.
  //    (The browser can't fetch arbitrary cross-origin sites; the Edge Function can.)
  let site: ScrapedSite | null = null;
  try {
    const { data, error } = await hubClient.functions.invoke('scrape-site', {
      body: { url: formattedUrl },
    });
    if (!error && data && !data.error) site = data as ScrapedSite;
  } catch (e) {
    console.warn('scrape-site unavailable, falling back to search grounding:', e);
  }

  const scraped = !!site && (((site.text?.length || 0) > 120) || ((site.colors?.length || 0) > 0));

  try {
    if (scraped && site) {
      // ACCURATE path — build strictly from the scraped content; colors chosen
      // from the real on-page palette. Strict JSON schema (grounding not needed).
      const prompt = `You are a brand strategist. Build a brand identity STRICTLY from this real content scraped from ${formattedUrl}. Do NOT invent an unrelated business.

TITLE: ${site.title || '(none)'}
META DESCRIPTION: ${site.description || '(none)'}
THEME COLOR: ${site.themeColor || '(none)'}
ON-PAGE COLORS (most frequent first): ${site.colors.join(', ') || '(none)'}
ON-PAGE FONTS: ${site.fonts.join(', ') || '(none)'}
PAGE TEXT (truncated):
"""${site.text}"""

Rules:
- name, tagline, mission, values, targetAudience, voice, marketingHooks, imagePrompt and sitePreviewDescription must reflect what this product ACTUALLY is per the content above.
- colorPalette: pick primary/secondary/accent from the ON-PAGE COLORS (prefer the theme color for primary); use white/near-white or a light grey for neutral — never a random color.
- typography: use the ON-PAGE FONTS when present (heading = the display/primary font, body = a readable one).
- marketingHooks: exactly 3 angles specific to what this product does.`;

      const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: BRAND_SCHEMA },
      });
      const data = safeParseJSON<ExtractedBrandData>(response.text, EMPTY_BRAND_DATA);
      return buildBrand(branchId, formattedUrl, data, site);
    }

    // FALLBACK — the site couldn't be scraped (blocked, or JS-only render):
    // use Google Search grounding so the model still reasons from real info.
    const prompt = `You are a brand strategist. Use Google Search to research "${formattedUrl}" and the product behind it. Determine what it ACTUALLY is — do not guess from the domain or invent an unrelated business.

Return ONLY a single JSON object (no markdown) with keys: name, tagline, mission, values (3-5), targetAudience, voice, colorPalette {primary, secondary, accent, neutral as #hex}, typography {heading, body}, imagePrompt, marketingHooks (3, specific to the product), sitePreviewDescription. If exact brand colors are unknown, choose a palette that authentically fits the product's category.`;

    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0.4 },
    });
    const data = extractJSON<ExtractedBrandData>(response.text, EMPTY_BRAND_DATA);
    return buildBrand(branchId, formattedUrl, data, site);

  } catch (err) {
    console.error('Brand extraction failed:', err);
    throw new Error(`Failed to analyze website: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// BRAND GENERATION (from description, no URL)
// ═══════════════════════════════════════════════════════════════

export async function generateBrandFromDescription(
  description: string,
  branchId: string,
  apiKey: string
): Promise<Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>> {
  const ai = getAIClient(apiKey);

  const prompt = `You are a brand strategist creating a complete brand identity based on this description:

"${description}"

Generate a professional, cohesive brand identity including:
1. Brand name (creative, memorable)
2. Tagline (concise, impactful)
3. Mission statement
4. Core values (3-5)
5. Target audience description
6. Brand voice/tone
7. Color palette (provide hex codes that match the brand personality)
8. Typography recommendations
9. Image prompt for generating on-brand visuals
10. Marketing hooks (3 campaign angles)`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            tagline: { type: Type.STRING },
            mission: { type: Type.STRING },
            values: { type: Type.ARRAY, items: { type: Type.STRING } },
            targetAudience: { type: Type.STRING },
            voice: { type: Type.STRING },
            colorPalette: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING },
                secondary: { type: Type.STRING },
                accent: { type: Type.STRING },
                neutral: { type: Type.STRING }
              },
              required: ['primary', 'secondary', 'accent', 'neutral']
            },
            typography: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                body: { type: Type.STRING }
              },
              required: ['heading', 'body']
            },
            imagePrompt: { type: Type.STRING },
            marketingHooks: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['name', 'tagline', 'mission', 'values', 'targetAudience', 'voice', 'colorPalette', 'typography', 'imagePrompt', 'marketingHooks']
        }
      }
    });

    const data = safeParseJSON<ExtractedBrandData>(response.text, EMPTY_BRAND_DATA);

    return {
      branch_id: branchId,
      name: data.name || 'Unnamed Brand',
      tagline: data.tagline || '',
      mission: data.mission || '',
      values: Array.isArray(data.values) ? data.values : [],
      target_audience: data.targetAudience || '',
      voice: data.voice || '',
      website_url: undefined,
      screenshot_url: undefined,
      color_palette: data.colorPalette || EMPTY_BRAND_DATA.colorPalette,
      typography: data.typography || EMPTY_BRAND_DATA.typography,
      image_prompt: data.imagePrompt || '',
      marketing_hooks: Array.isArray(data.marketingHooks) ? data.marketingHooks : [],
      site_preview_description: '',
      extracted_images: [],
      status: 'draft'
    };

  } catch (err) {
    console.error('Brand generation failed:', err);
    throw new Error(`Failed to generate brand: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SOCIAL MOCKUP GENERATION
// ═══════════════════════════════════════════════════════════════

type SocialPlatform = 'Instagram' | 'LinkedIn' | 'TikTok' | 'Facebook' | 'X';

interface PlatformConfig {
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:5';
}

function getPlatformConfig(identity: BrandIdentity, platform: SocialPlatform): PlatformConfig {
  const { name, tagline, mission, values, color_palette } = identity;
  const safeValue = values?.[0] || 'quality';

  const configs: Record<SocialPlatform, PlatformConfig> = {
    Instagram: {
      prompt: `High-end Instagram ad for "${name}". Lifestyle photo showing ${safeValue}. Primary color: ${color_palette.primary}. Clean, modern typography. Tagline: "${tagline}"`,
      aspectRatio: '1:1'
    },
    Facebook: {
      prompt: `Facebook News Feed ad for "${name}". Community-focused, warm lighting. Tagline: "${tagline}". Colors: ${color_palette.primary}, ${color_palette.secondary}.`,
      aspectRatio: '1:1'
    },
    LinkedIn: {
      prompt: `Professional LinkedIn ad for "${name}". Clean, modern workspace or architectural visual. Mission: "${mission}". Business-appropriate, trustworthy.`,
      aspectRatio: '16:9'
    },
    TikTok: {
      prompt: `TikTok vertical ad for "${name}". High-energy, trend-focused visual. Accent color ${color_palette.accent}. Dynamic, youthful framing.`,
      aspectRatio: '9:16'
    },
    X: {
      prompt: `X/Twitter ad for "${name}". Bold, attention-grabbing visual. Colors: ${color_palette.primary}. Concise, impactful design.`,
      aspectRatio: '16:9'
    }
  };

  return configs[platform];
}

export async function generateSocialMockupPrompt(
  identity: BrandIdentity,
  platform: SocialPlatform
): Promise<{ prompt: string; aspectRatio: '1:1' | '16:9' | '9:16' | '4:5' }> {
  // For now, return the prompt config for manual image generation
  // TODO: Integrate with Gemini image generation when available
  const config = getPlatformConfig(identity, platform);
  return {
    prompt: config.prompt,
    aspectRatio: config.aspectRatio
  };
}

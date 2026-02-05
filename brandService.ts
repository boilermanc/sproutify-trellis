import { GoogleGenAI, Type } from "@google/genai";
import { BrandIdentity, BrandColorPalette, BrandTypography, GeneratedBrandAsset } from './types';

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

export async function extractBrandFromUrl(
  websiteUrl: string,
  branchId: string,
  apiKey: string
): Promise<Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>> {
  const ai = getAIClient(apiKey);
  const formattedUrl = formatUrl(websiteUrl);

  const prompt = `You are a brand strategist analyzing the website at: "${formattedUrl}".

ANALYZE AND EXTRACT:
1. Brand name and tagline from the site
2. Mission statement or core purpose (infer if not explicit)
3. Core values (3-5 values the brand embodies)
4. Target audience description
5. Brand voice/tone description
6. Color palette - extract ACTUAL hex codes used on the site:
   - primary: main brand color
   - secondary: supporting color
   - accent: CTA/highlight color
   - neutral: background/text color
7. Typography - identify font families for headings and body text
8. Image prompt - describe visuals that would match this brand's aesthetic
9. Marketing hooks - 3 compelling campaign angles for this brand
10. Site preview - one sentence describing the homepage layout and feel

If the site is a placeholder or minimal, infer a professional identity based on the domain name and any available content.`;

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
            marketingHooks: { type: Type.ARRAY, items: { type: Type.STRING } },
            sitePreviewDescription: { type: Type.STRING }
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
      website_url: formattedUrl,
      screenshot_url: getScreenshotUrl(formattedUrl),
      color_palette: data.colorPalette || EMPTY_BRAND_DATA.colorPalette,
      typography: data.typography || EMPTY_BRAND_DATA.typography,
      image_prompt: data.imagePrompt || '',
      marketing_hooks: Array.isArray(data.marketingHooks) ? data.marketingHooks : [],
      site_preview_description: data.sitePreviewDescription || '',
      extracted_images: [],
      status: 'draft'
    };

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

import { supabase } from '../lib/supabase';
import { generateText } from './aiService';
import {
  MarketingBrand,
  MarketingGenerationLog,
  PositioningResult,
  LeadMagnetResult,
  AdCopyBundle,
  EmailSequenceResult,
  ApiKeyConfig,
} from '../types';
import {
  buildPositioningPrompt,
  buildLeadMagnetOutlinePrompt,
  buildLeadMagnetContentPrompt,
  buildAdCopyPrompt,
  buildEmailSequencePrompt,
} from '../prompts/marketingPrompts';

const MODEL_MAP: Record<string, string> = {
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

interface GenerationLogParams {
  campaign_id?: string;
  brand_id?: string;
  branch_id?: string;
  generation_type: MarketingGenerationLog['generation_type'];
  provider: string;
  model: string;
  prompt_hash?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_estimate?: number;
  duration_ms?: number;
  status: MarketingGenerationLog['status'];
  output: Record<string, any>;
  error?: string;
}

// Helper: parse JSON from LLM response, handling markdown fences
function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

function buildBrandContext(brand: MarketingBrand): string {
  return [
    brand.description && `Description: ${brand.description}`,
    brand.target_audience && `Core audience: ${brand.target_audience}`,
    brand.value_proposition && `Value proposition: ${brand.value_proposition}`,
    brand.keywords?.length && `Brand keywords: ${brand.keywords.join(', ')}`,
    brand.website_url && `Website: ${brand.website_url}`,
  ].filter(Boolean).join('\n') || 'No additional brand context provided.';
}

function buildComplianceFooter(brand: MarketingBrand): string {
  if (!brand.address_line_1 || !brand.city || !brand.state_region || !brand.postal_code) {
    return '';
  }

  const addressLines = [
    brand.address_line_1,
    brand.address_line_2,
    `${brand.city}, ${brand.state_region} ${brand.postal_code}`,
    brand.country_code && brand.country_code !== 'US' ? brand.country_code : '',
  ].filter(Boolean);

  return `\n\n---\n${brand.legal_name || brand.name}\n${addressLines.join('\n')}`;
}

export const marketingGenerationService = {

  // ── Logging ──────────────────────────────────────────────
  async logGeneration(params: GenerationLogParams): Promise<MarketingGenerationLog> {
    const { data, error } = await supabase
      .from('marketing_generations')
      .insert(params)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getGenerationsByBrand(brandId: string): Promise<MarketingGenerationLog[]> {
    const { data, error } = await supabase
      .from('marketing_generations')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getGenerationsByCampaign(campaignId: string): Promise<MarketingGenerationLog[]> {
    const { data, error } = await supabase
      .from('marketing_generations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // ── AI Generation Methods ───────────────────────────────

  async generatePositioning(
    brand: MarketingBrand,
    productDescription: string,
    competitors: string[],
    targetSegments: string[],
    apiKeys: ApiKeyConfig
  ): Promise<PositioningResult> {
    const startTime = Date.now();
    const { prompt, systemPrompt } = buildPositioningPrompt(
      brand.name,
      brand.industry || 'General',
      brand.tone || 'Professional',
      productDescription,
      competitors,
      targetSegments,
      buildBrandContext(brand)
    );

    const result = await generateText(apiKeys, {
      prompt,
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.7,
    });

    if (result.error || !result.text) {
      await this.logGeneration({
        brand_id: brand.id,
        branch_id: brand.branch_id,
        generation_type: 'positioning',
        provider: result.provider || apiKeys.active_llm,
        model: MODEL_MAP[result.provider || apiKeys.active_llm] || apiKeys.active_llm,
        duration_ms: Date.now() - startTime,
        status: 'failed',
        output: {},
        error: result.error || 'Empty response',
      });
      throw new Error(result.error || 'Failed to generate positioning');
    }

    let parsed: PositioningResult;
    try {
      parsed = parseJsonResponse<PositioningResult>(result.text);
    } catch (parseError: any) {
      try {
        await this.logGeneration({
          brand_id: brand.id,
          branch_id: brand.branch_id,
          generation_type: 'positioning',
          provider: result.provider,
          model: MODEL_MAP[result.provider] || result.provider,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          output: { raw_text: result.text?.substring(0, 500) },
          error: `JSON parse error: ${parseError.message}`,
        });
      } catch (logErr) {
        console.warn('Failed to log generation error:', logErr);
      }
      throw new Error('AI returned invalid JSON for positioning. Try regenerating.');
    }

    await this.logGeneration({
      brand_id: brand.id,
      branch_id: brand.branch_id,
      generation_type: 'positioning',
      provider: result.provider,
      model: MODEL_MAP[result.provider] || result.provider,
      duration_ms: Date.now() - startTime,
      status: 'completed',
      output: parsed as any,
    });

    return parsed;
  },

  async generateLeadMagnetOutline(
    brand: MarketingBrand,
    positioning: PositioningResult,
    targetSegments: string[],
    objective: string,
    apiKeys: ApiKeyConfig
  ): Promise<LeadMagnetResult> {
    const startTime = Date.now();
    const { prompt, systemPrompt } = buildLeadMagnetOutlinePrompt(
      brand.name,
      brand.tone || 'Professional',
      positioning.statement,
      positioning.unique_angle,
      targetSegments,
      objective,
      buildBrandContext(brand)
    );

    const result = await generateText(apiKeys, {
      prompt,
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.7,
    });

    if (result.error || !result.text) {
      await this.logGeneration({
        brand_id: brand.id,
        branch_id: brand.branch_id,
        generation_type: 'lead_magnet_outline',
        provider: result.provider || apiKeys.active_llm,
        model: MODEL_MAP[result.provider || apiKeys.active_llm] || apiKeys.active_llm,
        duration_ms: Date.now() - startTime,
        status: 'failed',
        output: {},
        error: result.error || 'Empty response',
      });
      throw new Error(result.error || 'Failed to generate lead magnet outline');
    }

    let parsed: LeadMagnetResult;
    try {
      parsed = parseJsonResponse<LeadMagnetResult>(result.text);
    } catch (parseError: any) {
      try {
        await this.logGeneration({
          brand_id: brand.id,
          branch_id: brand.branch_id,
          generation_type: 'lead_magnet_outline',
          provider: result.provider,
          model: MODEL_MAP[result.provider] || result.provider,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          output: { raw_text: result.text?.substring(0, 500) },
          error: `JSON parse error: ${parseError.message}`,
        });
      } catch (logErr) {
        console.warn('Failed to log generation error:', logErr);
      }
      throw new Error('AI returned invalid JSON for lead magnet outline. Try regenerating.');
    }

    await this.logGeneration({
      brand_id: brand.id,
      branch_id: brand.branch_id,
      generation_type: 'lead_magnet_outline',
      provider: result.provider,
      model: MODEL_MAP[result.provider] || result.provider,
      duration_ms: Date.now() - startTime,
      status: 'completed',
      output: parsed as any,
    });

    return parsed;
  },

  async generateLeadMagnetContent(
    brand: MarketingBrand,
    outline: LeadMagnetResult,
    apiKeys: ApiKeyConfig
  ): Promise<string> {
    const startTime = Date.now();
    const chapters: string[] = [];
    const outlineContext = outline.outline
      .map((ch, i) => `${i + 1}. ${ch.title}: ${ch.description}`)
      .join('\n');

    for (const chapter of outline.outline) {
      const { prompt, systemPrompt } = buildLeadMagnetContentPrompt(
        brand.name,
        brand.tone || 'Professional',
        chapter.title,
        chapter.description,
        chapter.key_points,
        outlineContext,
        buildBrandContext(brand)
      );

      const result = await generateText(apiKeys, {
        prompt,
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.75,
      });

      if (result.text) {
        chapters.push(result.text);
      } else {
        chapters.push(`## ${chapter.title}\n\n*Content generation failed for this chapter.*`);
      }
    }

    const fullContent = `# ${outline.title}\n\n*${outline.subtitle}*\n\n${chapters.join('\n\n---\n\n')}`;

    await this.logGeneration({
      brand_id: brand.id,
      branch_id: brand.branch_id,
      generation_type: 'lead_magnet_content',
      provider: apiKeys.active_llm,
      model: MODEL_MAP[apiKeys.active_llm] || apiKeys.active_llm,
      duration_ms: Date.now() - startTime,
      status: 'completed',
      output: { content_length: fullContent.length, chapter_count: chapters.length },
    });

    return fullContent;
  },

  async generateAdCopy(
    brand: MarketingBrand,
    positioning: PositioningResult,
    productDescription: string,
    targetSegments: string[],
    platforms: string[],
    apiKeys: ApiKeyConfig
  ): Promise<AdCopyBundle> {
    const startTime = Date.now();
    const { prompt, systemPrompt } = buildAdCopyPrompt(
      brand.name,
      brand.tone || 'Professional',
      positioning.statement,
      positioning.unique_angle,
      productDescription,
      targetSegments,
      platforms,
      buildBrandContext(brand)
    );

    const result = await generateText(apiKeys, {
      prompt,
      systemPrompt,
      maxTokens: 3000,
      temperature: 0.8,
    });

    if (result.error || !result.text) {
      await this.logGeneration({
        brand_id: brand.id,
        branch_id: brand.branch_id,
        generation_type: 'ad_copy',
        provider: result.provider || apiKeys.active_llm,
        model: MODEL_MAP[result.provider || apiKeys.active_llm] || apiKeys.active_llm,
        duration_ms: Date.now() - startTime,
        status: 'failed',
        output: {},
        error: result.error || 'Empty response',
      });
      throw new Error(result.error || 'Failed to generate ad copy');
    }

    let parsed: AdCopyBundle;
    try {
      parsed = parseJsonResponse<AdCopyBundle>(result.text);
    } catch (parseError: any) {
      try {
        await this.logGeneration({
          brand_id: brand.id,
          branch_id: brand.branch_id,
          generation_type: 'ad_copy',
          provider: result.provider,
          model: MODEL_MAP[result.provider] || result.provider,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          output: { raw_text: result.text?.substring(0, 500) },
          error: `JSON parse error: ${parseError.message}`,
        });
      } catch (logErr) {
        console.warn('Failed to log generation error:', logErr);
      }
      throw new Error('AI returned invalid JSON for ad copy. Try regenerating.');
    }

    await this.logGeneration({
      brand_id: brand.id,
      branch_id: brand.branch_id,
      generation_type: 'ad_copy',
      provider: result.provider,
      model: MODEL_MAP[result.provider] || result.provider,
      duration_ms: Date.now() - startTime,
      status: 'completed',
      output: parsed as any,
    });

    return parsed;
  },

  async generateEmailSequence(
    brand: MarketingBrand,
    positioning: PositioningResult,
    leadMagnet: LeadMagnetResult,
    productDescription: string,
    targetSegments: string[],
    objective: string,
    apiKeys: ApiKeyConfig
  ): Promise<EmailSequenceResult> {
    const startTime = Date.now();
    const { prompt, systemPrompt } = buildEmailSequencePrompt(
      brand.name,
      brand.tone || 'Professional',
      positioning.statement,
      leadMagnet.title,
      productDescription,
      targetSegments,
      objective,
      buildBrandContext(brand)
    );

    const result = await generateText(apiKeys, {
      prompt,
      systemPrompt,
      maxTokens: 4000,
      temperature: 0.75,
    });

    if (result.error || !result.text) {
      await this.logGeneration({
        brand_id: brand.id,
        branch_id: brand.branch_id,
        generation_type: 'email_sequence',
        provider: result.provider || apiKeys.active_llm,
        model: MODEL_MAP[result.provider || apiKeys.active_llm] || apiKeys.active_llm,
        duration_ms: Date.now() - startTime,
        status: 'failed',
        output: {},
        error: result.error || 'Empty response',
      });
      throw new Error(result.error || 'Failed to generate email sequence');
    }

    let parsed: EmailSequenceResult;
    try {
      parsed = parseJsonResponse<EmailSequenceResult>(result.text);
    } catch (parseError: any) {
      try {
        await this.logGeneration({
          brand_id: brand.id,
          branch_id: brand.branch_id,
          generation_type: 'email_sequence',
          provider: result.provider,
          model: MODEL_MAP[result.provider] || result.provider,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          output: { raw_text: result.text?.substring(0, 500) },
          error: `JSON parse error: ${parseError.message}`,
        });
      } catch (logErr) {
        console.warn('Failed to log generation error:', logErr);
      }
      throw new Error('AI returned invalid JSON for email sequence. Try regenerating.');
    }

    const complianceFooter = buildComplianceFooter(brand);
    if (complianceFooter) {
      parsed = {
        ...parsed,
        emails: parsed.emails.map((email) => ({
          ...email,
          body_markdown: `${email.body_markdown}${complianceFooter}`,
        })),
      };
    }

    await this.logGeneration({
      brand_id: brand.id,
      branch_id: brand.branch_id,
      generation_type: 'email_sequence',
      provider: result.provider,
      model: MODEL_MAP[result.provider] || result.provider,
      duration_ms: Date.now() - startTime,
      status: 'completed',
      output: parsed as any,
    });

    return parsed;
  },
};

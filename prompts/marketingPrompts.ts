export interface PromptPair {
  prompt: string;
  systemPrompt: string;
}

const MARKETING_SYSTEM_BASE = `You are an expert marketing strategist and copywriter working inside Trellis, an AI-powered marketing platform. You generate professional, actionable marketing content.

RULES:
- Always respond with valid JSON matching the requested schema. No markdown fences, no commentary outside the JSON.
- Be specific and actionable — avoid generic filler.
- Adapt tone and vocabulary to match the brand voice provided.
- When competitors are listed, provide genuine strategic analysis, not placeholder text.`;

export function buildPositioningPrompt(
  brandName: string,
  brandIndustry: string,
  brandTone: string,
  productDescription: string,
  competitors: string[],
  targetSegments: string[],
  brandContext: string
): PromptPair {
  return {
    systemPrompt: MARKETING_SYSTEM_BASE,
    prompt: `Generate a competitive positioning analysis for the following brand and product.

BRAND: ${brandName}
INDUSTRY: ${brandIndustry}
BRAND VOICE: ${brandTone}
BRAND CONTEXT: ${brandContext}
PRODUCT/SERVICE: ${productDescription}
TARGET SEGMENTS: ${targetSegments.join(', ')}
COMPETITORS: ${competitors.length > 0 ? competitors.join(', ') : 'None specified — infer 3 likely competitors from the industry and product description'}

Respond with this exact JSON structure:
{
  "statement": "A 1-2 sentence positioning statement for this product",
  "differentiators": ["3-5 specific things that set this apart"],
  "competitive_analysis": [
    {
      "name": "Competitor Name",
      "strengths": ["2-3 strengths"],
      "weaknesses": ["2-3 weaknesses"],
      "positioning": "How they position themselves in one sentence"
    }
  ],
  "market_gap": "A paragraph describing the gap in the market this product fills",
  "unique_angle": "The single most compelling angle for marketing this product"
}

Generate analysis for ${competitors.length > 0 ? competitors.length : 3} competitors minimum.`
  };
}

export function buildLeadMagnetOutlinePrompt(
  brandName: string,
  brandTone: string,
  positioningStatement: string,
  uniqueAngle: string,
  targetSegments: string[],
  objective: string,
  brandContext: string
): PromptPair {
  return {
    systemPrompt: MARKETING_SYSTEM_BASE,
    prompt: `Create a lead magnet outline for the following brand.

BRAND: ${brandName}
BRAND VOICE: ${brandTone}
BRAND CONTEXT: ${brandContext}
POSITIONING: ${positioningStatement}
UNIQUE ANGLE: ${uniqueAngle}
TARGET AUDIENCE: ${targetSegments.join(', ')}
CAMPAIGN OBJECTIVE: ${objective}

The lead magnet should be a downloadable resource (ebook, checklist, playbook, or guide) that attracts the target audience and positions the brand as an authority.

Respond with this exact JSON structure:
{
  "title": "Compelling title for the lead magnet",
  "subtitle": "Supporting subtitle",
  "type": "one of: ebook, checklist, playbook, guide",
  "outline": [
    {
      "title": "Chapter/Section Title",
      "description": "What this section covers in 1-2 sentences",
      "key_points": ["3-4 specific points covered"]
    }
  ],
  "content_markdown": ""
}

Generate 4-6 chapters/sections. Leave content_markdown empty — it will be generated separately.`
  };
}

export function buildLeadMagnetContentPrompt(
  brandName: string,
  brandTone: string,
  chapterTitle: string,
  chapterDescription: string,
  keyPoints: string[],
  fullOutlineContext: string,
  brandContext: string
): PromptPair {
  return {
    systemPrompt: `${MARKETING_SYSTEM_BASE}

For this task, you are writing one chapter of a lead magnet. Write in markdown format with headers, bullet points, and emphasis where appropriate. The content should be educational, actionable, and subtly position the brand as the solution.`,
    prompt: `Write the complete content for this chapter of a lead magnet by ${brandName}.

BRAND VOICE: ${brandTone}
BRAND CONTEXT: ${brandContext}
CHAPTER TITLE: ${chapterTitle}
CHAPTER DESCRIPTION: ${chapterDescription}
KEY POINTS TO COVER: ${keyPoints.join(', ')}

FULL OUTLINE (for context on where this chapter fits):
${fullOutlineContext}

Write 600-1000 words in markdown format. Include practical examples, actionable tips, and a subtle tie-back to how ${brandName} helps solve the problem discussed. Do NOT wrap the output in JSON — return raw markdown only.`
  };
}

export function buildAdCopyPrompt(
  brandName: string,
  brandTone: string,
  positioningStatement: string,
  uniqueAngle: string,
  productDescription: string,
  targetSegments: string[],
  platforms: string[],
  brandContext: string
): PromptPair {
  return {
    systemPrompt: MARKETING_SYSTEM_BASE,
    prompt: `Generate ad copy variations for the following brand across multiple platforms.

BRAND: ${brandName}
BRAND VOICE: ${brandTone}
BRAND CONTEXT: ${brandContext}
POSITIONING: ${positioningStatement}
UNIQUE ANGLE: ${uniqueAngle}
PRODUCT/SERVICE: ${productDescription}
TARGET AUDIENCE: ${targetSegments.join(', ')}
PLATFORMS: ${platforms.join(', ')}

Respond with this exact JSON structure:
{
  "google_search": [
    { "headline": "Max 30 chars", "body": "Max 90 chars", "cta": "Call to action text", "platform_notes": "Any platform-specific guidance" }
  ],
  "linkedin": [
    { "headline": "Professional headline", "body": "150-200 word post body", "cta": "CTA text", "platform_notes": "" }
  ],
  "meta": [
    { "headline": "Attention-grabbing headline", "body": "125-word ad body optimized for Facebook/Instagram", "cta": "CTA text", "platform_notes": "" }
  ],
  "x": [
    { "headline": "Hook line", "body": "Max 280 chars including headline", "cta": "CTA text", "platform_notes": "" }
  ]
}

Generate 2-3 variations per platform. Each variation should take a different angle (emotional, logical, social proof, urgency, etc.). Only include platforms from the PLATFORMS list.`
  };
}

export function buildEmailSequencePrompt(
  brandName: string,
  brandTone: string,
  positioningStatement: string,
  leadMagnetTitle: string,
  productDescription: string,
  targetSegments: string[],
  objective: string,
  brandContext: string
): PromptPair {
  return {
    systemPrompt: MARKETING_SYSTEM_BASE,
    prompt: `Create a 4-email nurture sequence for the following brand.

BRAND: ${brandName}
BRAND VOICE: ${brandTone}
BRAND CONTEXT: ${brandContext}
POSITIONING: ${positioningStatement}
LEAD MAGNET: ${leadMagnetTitle}
PRODUCT/SERVICE: ${productDescription}
TARGET AUDIENCE: ${targetSegments.join(', ')}
CAMPAIGN OBJECTIVE: ${objective}

The sequence should nurture leads who downloaded the lead magnet "${leadMagnetTitle}" toward the campaign objective.

Respond with this exact JSON structure:
{
  "emails": [
    {
      "sequence_number": 1,
      "delay_days": 0,
      "subject": "Email subject line",
      "preview_text": "Preview/preheader text (max 100 chars)",
      "body_markdown": "Full email body in markdown. Use {{first_name}} for personalization.",
      "cta_text": "Button text",
      "cta_url_placeholder": "{{lead_magnet_url}} or {{product_url}} etc."
    }
  ],
  "strategy_notes": "Brief explanation of the overall nurture strategy and why this sequence works"
}

Email cadence: sequence_number 1 = delay_days 0 (immediate), sequence_number 2 = delay_days 2, sequence_number 3 = delay_days 5, sequence_number 4 = delay_days 8. Each email should build on the previous one, moving the reader closer to the campaign objective. Use merge tags {{first_name}} and {{brand_name}} where appropriate.`
  };
}

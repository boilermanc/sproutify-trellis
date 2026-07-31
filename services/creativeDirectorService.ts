import { GoogleGenAI, Type } from '@google/genai';
import { CardConcept, CardPalette, CardTemplate } from '../types';
import { sanitizePII } from './aiService';

// ─── Card Studio: AI Creative Director ─────────────────────────────
// Half of a two-part pipeline: this service takes a loose brief and
// returns several finished, visually DIFFERENT post CONCEPTS (structured
// data, not images) for a human to review. `utils/cardRenderer.ts` (owned
// by a different pass) turns an approved concept into an actual PNG.
// Image models can't reliably render text or lay out a grid, so the
// "creative" step here is the AI writing a `CardConcept`, not a pixel.
// ────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-3-flash-preview';

// ─── Verse library ──────────────────────────────────────────────────
// HAND-VERIFIED, NIV. This list is intentionally small and static — it is
// the ONLY set of verses the AI director is allowed to use. Misquoted or
// fabricated scripture is unacceptable for this brand, so we never let the
// model invent a reference; it can only pick (verbatim) from here or fall
// back to a non-scripture template. Do NOT let an AI agent "helpfully"
// extend this list — every entry must be checked against NIV by a human
// before it's added.
export const VERSE_LIBRARY: { emotion: string; text: string; reference: string }[] = [
  {
    emotion: 'anxiety',
    text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
    reference: 'Philippians 4:6 · NIV',
  },
  {
    emotion: 'grief',
    text: 'The LORD is close to the brokenhearted and saves those who are crushed in spirit.',
    reference: 'Psalm 34:18 · NIV',
  },
  {
    emotion: 'weariness',
    text: 'Come to me, all you who are weary and burdened, and I will give you rest.',
    reference: 'Matthew 11:28 · NIV',
  },
  {
    emotion: 'loneliness',
    text: 'Be strong and courageous. Do not be afraid or terrified because of them, for the LORD your God goes with you; he will never leave you nor forsake you.',
    reference: 'Deuteronomy 31:6 · NIV',
  },
  {
    emotion: 'fear',
    text: 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.',
    reference: 'Isaiah 41:10 · NIV',
  },
  {
    emotion: 'doubt',
    text: 'I do believe; help me overcome my unbelief!',
    reference: 'Mark 9:24 · NIV',
  },
  {
    emotion: 'gratitude',
    text: 'Give thanks in all circumstances; for this is God’s will for you in Christ Jesus.',
    reference: '1 Thessalonians 5:18 · NIV',
  },
  {
    emotion: 'hope',
    text: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.',
    reference: 'Jeremiah 29:11 · NIV',
  },
];

// ─── Brief presets ──────────────────────────────────────────────────
export const CARD_BRIEF_PRESETS: { label: string; brief: string; branchSlug?: string }[] = [
  {
    label: 'Rejoice — daily motivational posts',
    brief:
      "Create some Instagram ads, motivational ideas we'd post daily that tie into Rejoice — the Bible study app that starts with how you feel. Give me a few strong, visually different examples. Some can use a real, verified verse if one genuinely fits; others should be a bold typographic statement or a short grid of feelings/steps. Warm and encouraging, never preachy or guilt-driven.",
    branchSlug: 'letsrejoice.app',
  },
  {
    label: 'ATL Urban Farms — weekly harvest hype',
    brief:
      "Create Instagram post concepts hyping this week's fresh seedlings and harvest at ATL Urban Farms. Earthy, warm, grow-your-own energy — not corporate. No scripture needed here.",
    branchSlug: 'atlurbanfarms.com',
  },
  {
    label: 'General — bold brand statement pack',
    brief:
      'Create a few bold, typographic Instagram statement posts about why our brand exists and what makes it different. No verses — just punchy, confident copy that stops the scroll.',
  },
];

// ─── Gemini response schema ─────────────────────────────────────────
// Every field from every template is present in the schema (Gemini
// structured output doesn't support true per-branch optionality), but only
// `template`/`palette`/`eyebrow`/`logoText`/`caption`/`rationale` are
// required at the API level — everything else is validated and repaired
// (or the concept is dropped) after parsing in `normalizeConcept`.
const CARD_CONCEPT_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    template: { type: Type.STRING, enum: ['verse', 'statement', 'grid'] },
    palette: {
      type: Type.OBJECT,
      properties: {
        bg1: { type: Type.STRING },
        bg2: { type: Type.STRING },
        text: { type: Type.STRING },
        muted: { type: Type.STRING },
        accent: { type: Type.STRING },
      },
      required: ['bg1', 'text', 'muted', 'accent'],
    },
    eyebrow: { type: Type.STRING },
    logoText: { type: Type.STRING },
    caption: { type: Type.STRING },
    // verse
    body: { type: Type.STRING },
    reference: { type: Type.STRING },
    // statement
    statement: { type: Type.STRING },
    statementEmphasis: { type: Type.STRING },
    subline: { type: Type.STRING },
    // grid
    heading: { type: Type.STRING },
    items: { type: Type.ARRAY, items: { type: Type.STRING } },
    highlightIndex: { type: Type.INTEGER },
    footnote: { type: Type.STRING },
    // provenance
    rationale: { type: Type.STRING },
  },
  required: ['template', 'palette', 'eyebrow', 'logoText', 'caption', 'rationale'],
};

const CARD_CONCEPTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    concepts: { type: Type.ARRAY, items: CARD_CONCEPT_ITEM_SCHEMA },
  },
  required: ['concepts'],
};

// ─── Prompt ──────────────────────────────────────────────────────────

function buildDirectorPrompt(opts: {
  brandName: string;
  brandContext: string;
  brief: string;
  count: number;
  palette?: { primary?: string; secondary?: string; accent?: string };
}): string {
  const verseList = VERSE_LIBRARY.map((v) => `- [${v.emotion}] "${v.text}" — ${v.reference}`).join('\n');

  const paletteHint = opts.palette && (opts.palette.primary || opts.palette.secondary || opts.palette.accent)
    ? `Brand colors for INSPIRATION ONLY (not mandatory — concepts do not need to be on-brand): primary ${opts.palette.primary || 'n/a'}, secondary ${opts.palette.secondary || 'n/a'}, accent ${opts.palette.accent || 'n/a'}.`
    : '';

  return `You are a senior art director AND copywriter producing designed Instagram post CONCEPTS for ${opts.brandName} — structured data that a renderer will draw, not an image you generate yourself. Image models can't reliably render text or lay out a grid, so your job is to write the concept precisely.

BRAND: ${opts.brandName}
BRAND CONTEXT: ${sanitizePII(opts.brandContext || 'n/a')}
${paletteHint}

BRIEF FROM THE MARKETER:
"${sanitizePII(opts.brief)}"

Produce EXACTLY ${opts.count} concepts. They must be DELIBERATELY DIFFERENT from each other: vary the template, vary the palette, vary the angle or emotion. Do not produce near-duplicates — a reviewer should look at the set and see real options, not the same idea three times.

TEMPLATES (pick per concept, whichever best fits that concept's angle):
1. "verse" — a Bible verse on a gradient. Needs: body (the verse text, copied EXACTLY, no paraphrasing), reference (e.g. "Philippians 4:6 · NIV").
2. "statement" — a bold typographic statement, no scripture. Needs: statement (a short, punchy line), and may optionally include statementEmphasis (1-3 emphasized words) and subline (a short supporting line).
3. "grid" — a small grid of short items (a checklist, a list of feelings, steps, or ideas). Needs: heading, items (3 to 6 SHORT strings, a few words each), and may optionally include highlightIndex (the index of the one item to visually emphasize) and footnote.

EVERY concept, regardless of template, also needs:
- eyebrow: a short tracked label above the main content, e.g. "FOR WHEN YOU FEEL ANXIOUS"
- logoText: the brand mark line — usually just "${opts.brandName}"
- caption: a publish-ready Instagram caption with a natural, non-spammy call to action
- rationale: ONE sentence explaining the idea/angle, written for the human deciding whether to approve it
- palette: {bg1, bg2 (optional gradient end), text, muted, accent} — real CSS hex colors (e.g. "#1c2b23"). text and bg1 MUST have strong, obviously readable contrast. Each concept's palette is its OWN choice and does not need to match the brand's colors or any other concept's palette — but it must be internally consistent (muted and accent should make sense against bg1, not clash or disappear).

HARD RULE — DO NOT INVENT SCRIPTURE:
If (and only if) a concept uses the "verse" template, the body and reference MUST be copied verbatim, word-for-word, from this pre-approved list. Do not alter wording, do not invent a new reference, do not use any verse that is not on this list:
${verseList}
If no verse on this list genuinely fits the brief, use "statement" or "grid" instead of "verse" for that concept. A misquoted or fabricated verse is unacceptable for this brand — when in doubt, do not use "verse".

Return ONLY the structured JSON matching the schema — no markdown, no commentary.`;
}

// ─── Validation / repair ────────────────────────────────────────────

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

function hexToLuminance(hex: string): number {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = hexToLuminance(hexA) + 0.05;
  const lumB = hexToLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

// Repairs a raw palette object into a guaranteed-valid CardPalette: any
// field that isn't a real hex color falls back to a sane default for its
// role, and text is forced to black/white (whichever contrasts more) if the
// model handed back a text/bg1 pair that would be unreadable.
function normalizePalette(raw: any): CardPalette {
  const bg1 = isHexColor(raw?.bg1) ? raw.bg1.trim() : '#14231c';
  const bg2 = isHexColor(raw?.bg2) ? raw.bg2.trim() : undefined;
  let text = isHexColor(raw?.text) ? raw.text.trim() : '#f8f7f2';
  const muted = isHexColor(raw?.muted) ? raw.muted.trim() : '#9aa79f';
  const accent = isHexColor(raw?.accent) ? raw.accent.trim() : '#d98c4a';

  // Guarantee real contrast between text and bg1 — if the model's pairing is
  // too close to call, force text to whichever of black/white reads better.
  if (contrastRatio(text, bg1) < 3) {
    text = hexToLuminance(bg1) > 0.5 ? '#111111' : '#ffffff';
  }

  const palette: CardPalette = { bg1, text, muted, accent };
  if (bg2) palette.bg2 = bg2;
  return palette;
}

// Validates one raw concept from the model and repairs what it can. Returns
// null (never throws) for anything that isn't renderable even after repair —
// callers filter nulls out so one bad concept never sinks the whole batch.
function normalizeConcept(raw: any, model: string): CardConcept | null {
  if (!raw || typeof raw !== 'object') return null;

  const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  if (!caption) return null; // publish-ready caption is non-negotiable

  let template: CardTemplate | null =
    raw.template === 'verse' || raw.template === 'statement' || raw.template === 'grid' ? raw.template : null;

  // Infer a template from whatever fields are actually present if the model
  // returned something outside the enum (defensive — schema should prevent
  // this, but never trust it blindly).
  if (!template) {
    if (typeof raw.body === 'string' && raw.body.trim() && typeof raw.reference === 'string' && raw.reference.trim()) {
      template = 'verse';
    } else if (Array.isArray(raw.items) && raw.items.filter((i: any) => typeof i === 'string' && i.trim()).length >= 2) {
      template = 'grid';
    } else if (typeof raw.statement === 'string' && raw.statement.trim()) {
      template = 'statement';
    } else {
      return null;
    }
  }

  const eyebrow = typeof raw.eyebrow === 'string' ? raw.eyebrow.trim() : '';
  const logoText = typeof raw.logoText === 'string' ? raw.logoText.trim() : '';
  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';
  const palette = normalizePalette(raw.palette);

  const base: CardConcept = {
    id: crypto.randomUUID(),
    template,
    palette,
    eyebrow,
    logoText,
    caption,
    rationale,
    model,
  };

  if (template === 'verse') {
    const body = typeof raw.body === 'string' ? raw.body.trim() : '';
    const reference = typeof raw.reference === 'string' ? raw.reference.trim() : '';

    // Belt-and-suspenders enforcement of "no invented scripture": only trust
    // a verse template if it matches an entry in the hand-verified library
    // (verbatim text or reference). Anything else gets demoted to a
    // statement using its own text rather than shipped as a "verse".
    const verified = VERSE_LIBRARY.find((v) => v.reference === reference || v.text.trim() === body);
    if (body && reference && verified) {
      base.body = verified.text;
      base.reference = verified.reference;
      return base;
    }
    // Not a verified verse — re-template rather than drop, if there's usable text.
    const fallbackStatement = body || (typeof raw.statement === 'string' ? raw.statement.trim() : '');
    if (!fallbackStatement) return null;
    base.template = 'statement';
    base.statement = fallbackStatement;
    return base;
  }

  if (template === 'statement') {
    const statement = typeof raw.statement === 'string' ? raw.statement.trim() : '';
    if (!statement) return null;
    base.statement = statement;
    if (typeof raw.statementEmphasis === 'string' && raw.statementEmphasis.trim()) base.statementEmphasis = raw.statementEmphasis.trim();
    if (typeof raw.subline === 'string' && raw.subline.trim()) base.subline = raw.subline.trim();
    return base;
  }

  // grid
  const items = Array.isArray(raw.items) ? raw.items.filter((i: any) => typeof i === 'string' && i.trim()).map((i: string) => i.trim()) : [];
  if (items.length < 2) return null; // not renderable as a grid
  base.heading = typeof raw.heading === 'string' ? raw.heading.trim() : '';
  base.items = items;
  if (typeof raw.highlightIndex === 'number' && Number.isInteger(raw.highlightIndex) && raw.highlightIndex >= 0 && raw.highlightIndex < items.length) {
    base.highlightIndex = raw.highlightIndex;
  }
  if (typeof raw.footnote === 'string' && raw.footnote.trim()) base.footnote = raw.footnote.trim();
  return base;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Brief in, finished concepts out. Client-side Gemini call using structured
 * output (responseSchema) — this codebase learned the hard way that asking
 * for JSON in prose gets markdown back instead. Never throws on a single
 * malformed concept from the model; it's filtered out and the rest of the
 * batch is returned. Throws only on total failure (bad/missing API key,
 * network error, or a response with no usable concepts at all).
 */
export async function generateCardConcepts(opts: {
  apiKey: string;
  brandName: string;
  brandContext: string;
  brief: string;
  count: number;
  palette?: { primary?: string; secondary?: string; accent?: string };
}): Promise<CardConcept[]> {
  if (!opts.apiKey) {
    throw new Error('Gemini API key is not configured. Add it in Settings before generating cards.');
  }
  if (!opts.brief || !opts.brief.trim()) {
    throw new Error('Give the director a brief to work from.');
  }

  const count = Math.max(1, Math.min(6, Math.round(opts.count) || 3));

  try {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey });
    const prompt = buildDirectorPrompt({ ...opts, count });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: CARD_CONCEPTS_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const rawConcepts: any[] = Array.isArray(parsed?.concepts) ? parsed.concepts : [];

    const concepts: CardConcept[] = [];
    for (const raw of rawConcepts) {
      const concept = normalizeConcept(raw, MODEL);
      if (concept) concepts.push(concept);
    }
    return concepts;
  } catch (err) {
    throw new Error(err instanceof Error ? `Card concept generation failed: ${err.message}` : 'Card concept generation failed.');
  }
}

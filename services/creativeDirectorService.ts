import { GoogleGenAI, Type } from '@google/genai';
import { BrandCardStyle, CardBullet, CardConcept, CardMessage, CardPalette, CardTemplate } from '../types';
import { sanitizePII } from './aiService';
import { USFM_BOOKS, VerseReference } from './bibleService';

// ─── Card Studio: AI Creative Director ─────────────────────────────
// Half of a two-part pipeline: this service takes a loose brief and
// returns several finished, visually DIFFERENT post CONCEPTS (structured
// data, not images) for a human to review. `utils/cardRenderer.ts` (owned
// by a different pass) turns an approved concept into an actual PNG.
// Image models can't reliably render text or lay out a grid, so the
// "creative" step here is the AI writing a `CardConcept`, not a pixel.
// ────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-3-flash-preview';

// `CardConcept` (types.ts) has no notion of a Bible reference — it's owned
// by a different pass and this file is not allowed to touch it. A `verse`
// concept instead carries its reference on this local extension, which
// `pages/CardStudio.tsx` reads to fetch the real text before rendering.
export interface CardConceptWithRef extends CardConcept {
  verse_ref?: VerseReference;
  // Editorial only: the director's description of the ideal PHOTOGRAPH behind
  // the layout — used by Card Studio's "Generate photo" button to brief the
  // Creative Studio photo pipeline for a matching background.
  photo_brief?: string;
}

// ─── No model may author scripture text ─────────────────────────────
// Misquoted or fabricated scripture is unacceptable for this brand, and NIV
// text is copyrighted. So the director is NEVER allowed to write out verse
// wording or a reference string — it may only PICK a `verse_ref`
// (book_id/chapter/verse range) from the closed USFM_BOOKS vocabulary.
// `pages/CardStudio.tsx` fetches the exact, licensed (Berean Standard
// Bible) wording server-side via `services/bibleService.ts` afterward. This
// mirrors the Rejoice app's own pattern: the model picks, the database
// supplies the words.
const MAX_VERSE_SPAN = 4;

// Allowed editorial bullet icons — kept in one place so the schema enum and
// the repair step (`normalizeBullets`) can never drift apart.
const ALLOWED_BULLET_ICONS: NonNullable<CardBullet['icon']>[] = ['heart', 'book', 'leaf', 'sparkle', 'check', 'sun'];
const DEFAULT_BULLET_ICON: NonNullable<CardBullet['icon']> = 'sparkle';
const MAX_BULLETS = 4;
const DEFAULT_SCRIM_STRENGTH = 0.72;

// ─── Brief presets ──────────────────────────────────────────────────
// branchSlug must match `branches.slug` (bare, e.g. 'rejoice') — NOT the domain
// key used by brand_profiles ('letsrejoice.app'). A preset with no branchSlug is
// shown for every brand.
export const CARD_BRIEF_PRESETS: { label: string; brief: string; branchSlug?: string; hint: string }[] = [
  {
    label: 'Rejoice — daily motivational posts',
    brief:
      "Create some Instagram ads, motivational ideas we'd post daily that tie into Rejoice — the Bible study app that starts with how you feel. Give me a few strong, visually different examples. Some can use a real, verified verse if one genuinely fits; others should be a bold typographic statement or a short grid of feelings/steps. Warm and encouraging, never preachy or guilt-driven.",
    branchSlug: 'rejoice',
    hint: 'A starting brief written specifically for Rejoice — feelings, verses, and encouragement. Click to load it into the brief box, then edit as you like.',
  },
  {
    label: 'ATL Urban Farms — weekly harvest hype',
    brief:
      "Create Instagram post concepts hyping this week's fresh seedlings and harvest at ATL Urban Farms. Earthy, warm, grow-your-own energy — not corporate. No scripture needed here.",
    branchSlug: 'atlurbanfarms',
    hint: "A starting brief written specifically for ATL Urban Farms — this week's harvest and seedlings. Click to load it into the brief box, then edit as you like.",
  },
  {
    label: 'Generic — bold statement pack',
    brief:
      'Create a few bold, typographic Instagram statement posts about why our brand exists and what makes it different. No verses — just punchy, confident copy that stops the scroll.',
    hint: 'Not written for any one brand — a fallback starting point for punchy, typographic statement posts. Shown on every brand as a backup for when there is no brand-specific preset yet, or if you just want a different angle. Click to load it into the brief box, then edit as you like.',
  },
];

// ─── Gemini response schema ─────────────────────────────────────────
// Every field from every template is present in the schema (Gemini
// structured output doesn't support true per-branch optionality), but only
// `template`/`palette`/`eyebrow`/`logoText`/`caption`/`rationale` are
// required at the API level — everything else is validated and repaired
// (or the concept is dropped) after parsing in `normalizeConcept`.
//
// `editorial` deliberately has NO `backgroundUrl` field here — that photo is
// supplied by the app (an upload or a pick from prior Creative Studio
// output), never invented by the model.
const CARD_CONCEPT_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    template: { type: Type.STRING, enum: ['verse', 'statement', 'grid', 'editorial'] },
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
    // verse — a REFERENCE only. Never verse text: the app fetches the
    // exact licensed wording server-side after the model picks this.
    verse_ref: {
      type: Type.OBJECT,
      properties: {
        book_id: { type: Type.STRING },
        chapter: { type: Type.INTEGER },
        verse_start: { type: Type.INTEGER },
        verse_end: { type: Type.INTEGER },
      },
    },
    // statement (also reused by "editorial" as its big serif headline)
    statement: { type: Type.STRING },
    statementEmphasis: { type: Type.STRING },
    subline: { type: Type.STRING },
    // grid
    heading: { type: Type.STRING },
    items: { type: Type.ARRAY, items: { type: Type.STRING } },
    highlightIndex: { type: Type.INTEGER },
    footnote: { type: Type.STRING },
    // editorial — a structured layout drawn over a photograph
    wordmark: { type: Type.STRING },
    wordmarkSubtitle: { type: Type.STRING },
    // NO minItems/maxItems here, deliberately. Adding them (an attempt to
    // force editorial cards to actually carry bullets) sent the model into a
    // runaway generation loop: a single concept produced a 190,000-character
    // response that hit the token ceiling and came back as truncated,
    // unparseable JSON — which surfaced as a silent hang. Constrained arrays
    // are a known trigger for that. The count is asked for in the prompt
    // instead, and normalizeConcept caps the array at MAX_BULLETS; an
    // editorial concept renders fine with none (drawEditorial handles an
    // empty list), so nothing needs enforcing at the schema level.
    bullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          emphasis: { type: Type.STRING },
          icon: { type: Type.STRING, enum: ALLOWED_BULLET_ICONS as unknown as string[] },
        },
        required: ['text'],
      },
    },
    footer: { type: Type.STRING },
    scrimStrength: { type: Type.NUMBER },
    // provenance
    rationale: { type: Type.STRING },
  },
  required: ['template', 'palette', 'eyebrow', 'logoText', 'caption', 'rationale'],
};

// Extracts complete top-level objects from the `concepts` array of a TRUNCATED
// JSON response. A degenerating model writes good concepts first and garbage
// after, so the front of the stream is usually intact even when the whole
// document can't parse. Walks the text with a string/escape-aware brace
// counter — a regex can't do this, since concept fields legally contain
// braces, brackets and quotes inside strings.
function salvageConceptObjects(rawText: string): any[] {
  const anchor = rawText.indexOf('"concepts"');
  if (anchor === -1) return [];
  const arrayStart = rawText.indexOf('[', anchor);
  if (arrayStart === -1) return [];

  const out: any[] = [];
  let i = arrayStart + 1;
  let objStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < rawText.length; i++) {
    const ch = rawText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(rawText.slice(objStart, i + 1)));
        } catch {
          // A structurally-balanced but invalid object — skip it; later
          // objects may still be fine.
        }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break; // clean end of the concepts array
    }
  }
  return out;
}

// ⚠️ DELIBERATELY NOT PASSED TO THE API. Sending this as responseSchema made
// gemini-3-flash-preview degenerate into a repetition loop mid-generation
// (large many-optional-field schema + thinking model = known constrained-
// decoding failure; it burned 76k characters repeating one Chinese fragment).
// Kept only as documentation of the expected shape — normalizeConcept() is
// the actual enforcement. Do not re-wire this into generateContent's config.
const CARD_CONCEPTS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    concepts: { type: Type.ARRAY, items: CARD_CONCEPT_ITEM_SCHEMA },
  },
  required: ['concepts'],
};

// ─── Prompt ──────────────────────────────────────────────────────────

// How much scripture the batch should contain. 'avoid' is forced automatically
// for brands with no Bible source — a verse card there can never render, so
// letting the director pick one just guarantees a broken card.
export type ScripturePolicy = 'mix' | 'require' | 'avoid';

function buildDirectorPrompt(opts: {
  brandName: string;
  brandContext: string;
  brief: string;
  count: number;
  palette?: { primary?: string; secondary?: string; accent?: string };
  scripturePolicy?: ScripturePolicy;
  cardStyle?: BrandCardStyle;
}): string {
  const bookVocab = USFM_BOOKS.map((b) => `${b.id} (${b.name})`).join(', ');

  const ALL_TEMPLATES: CardTemplate[] = ['verse', 'statement', 'grid', 'editorial', 'list', 'conversation', 'stat', 'quote'];
  const templatePolicy = opts.cardStyle?.templatePolicy;
  const allowedTemplates = templatePolicy?.mode === 'restricted' ? templatePolicy.allowed : null;
  const usableTemplates = allowedTemplates ?? ALL_TEMPLATES;
  const nonVerseUsable = usableTemplates.filter((t) => t !== 'verse');

  const policy = opts.scripturePolicy || 'mix';
  const scriptureRule =
    policy === 'avoid'
      ? `SCRIPTURE POLICY: do NOT use the "verse" template at all for this batch. You have ${nonVerseUsable.length} other template${nonVerseUsable.length === 1 ? '' : 's'} to choose from — ${nonVerseUsable.map((t) => `"${t}"`).join(', ')} — and you should use that range, not default to the same 2-3 out of habit. Do not quote or reference scripture anywhere, including in captions.`
      : policy === 'require'
      ? 'SCRIPTURE POLICY: every concept should use the "verse" template, unless you genuinely cannot name a fitting passage — in that case pick whichever non-verse template best fits that one rather than forcing a bad fit.'
      : `SCRIPTURE POLICY: mix the templates. Not every post needs scripture — a batch of all verse cards is monotonous. Aim for a spread across ${allowedTemplates ? 'this brand\'s allowed templates' : 'all 8 templates'} (${usableTemplates.map((t) => `"${t}"`).join(', ')}), not just the first few.`;

  // Palette policy governs BOTH the "brand colors for inspiration" hint below
  // and the per-concept palette field description further down — a locked
  // brand needs neither, since normalizeConcept discards whatever palette the
  // model writes and applies the locked one verbatim instead.
  const palettePolicy = opts.cardStyle?.palettePolicy;
  const isLockedPalette = palettePolicy?.mode === 'locked';

  const paletteHint = isLockedPalette
    ? ''
    : opts.palette && (opts.palette.primary || opts.palette.secondary || opts.palette.accent)
    ? `Brand colors for INSPIRATION ONLY (not mandatory — concepts do not need to be on-brand): primary ${opts.palette.primary || 'n/a'}, secondary ${opts.palette.secondary || 'n/a'}, accent ${opts.palette.accent || 'n/a'}.`
    : '';

  const paletteFieldRule = isLockedPalette
    ? 'PALETTE: this brand\'s colors are applied automatically — do not choose or describe a palette; put your variation into template choice and copy instead.'
    : `palette: {bg1, bg2 (optional gradient end), text, muted, accent} — real CSS hex colors (e.g. "#1c2b23"). text and bg1 MUST have strong, obviously readable contrast. Each concept's palette is its OWN choice and does not need to match the brand's colors or any other concept's palette — but it must be internally consistent (muted and accent should make sense against bg1, not clash or disappear). For "editorial" concepts the palette still matters (it colors the wordmark, headline and footer band over the photo scrim), even though the background itself is a photo, not this palette.${
        palettePolicy?.mode === 'expressive' && palettePolicy.guidance ? ` Stay within: ${palettePolicy.guidance}` : ''
      }`;

  const templatesIntro = allowedTemplates
    ? `TEMPLATES — this brand is RESTRICTED to a subset. You may ONLY use these templates: ${allowedTemplates.map((t) => `"${t}"`).join(', ')}. Distribute your concepts across that set and do not use any template outside it, even if another one seems like a good fit — adapt the idea to one of the allowed templates instead. (Every template is still fully described below for reference, including some you may not use here — pick only from the allowed list.)`
    : 'TEMPLATES (pick per concept, whichever best fits that concept\'s angle):';

  const varietyLine = allowedTemplates
    ? `VARIETY IS THE WHOLE POINT of offering ${usableTemplates.length} template${usableTemplates.length === 1 ? '' : 's'} for this brand — across this batch, actively DIVERSIFY across ${usableTemplates.map((t) => `"${t}"`).join(', ')}. Do not let every batch settle into the same one or two out of habit.`
    : 'VARIETY IS THE WHOLE POINT of having eight templates — across this batch, actively DIVERSIFY. Do not let every batch settle into "statement", "grid" and "editorial" out of habit; "list", "conversation", "stat" and "quote" exist specifically because that original set of four was producing visually repetitive concepts. When scripture is disallowed you still have 7 non-verse templates available — use the range instead of picking the same 2-3 every time.';

  return `You are a senior art director AND copywriter producing designed Instagram post CONCEPTS for ${opts.brandName} — structured data that a renderer will draw, not an image you generate yourself. Image models can't reliably render text or lay out a grid, so your job is to write the concept precisely.

BRAND: ${opts.brandName}
BRAND CONTEXT: ${sanitizePII(opts.brandContext || 'n/a')}
${paletteHint}

BRIEF FROM THE MARKETER:
"${sanitizePII(opts.brief)}"

Produce EXACTLY ${opts.count} concepts. They must be DELIBERATELY DIFFERENT from each other: vary the template, vary the palette, vary the angle or emotion. Do not produce near-duplicates — a reviewer should look at the set and see real options, not the same idea three times.

${templatesIntro}
1. "verse" — a Bible passage on a gradient. Needs ONLY verse_ref: {book_id, chapter, verse_start, verse_end?}. Do NOT write the verse's words or a "reference" string yourself — the app looks up the exact wording server-side afterward, from a licensed Bible database, using only the reference you pick. book_id MUST be one of these USFM ids (write the id, not the full name): ${bookVocab}. Keep the span short: verse_end is optional for a single verse, and when given, verse_end minus verse_start must be at most ${MAX_VERSE_SPAN - 1} (i.e. at most ${MAX_VERSE_SPAN} verses). Only pick a passage that genuinely, specifically fits the emotion or angle of this concept — never force a loose or generic fit.
2. "statement" — a bold typographic statement, no scripture. Needs: statement (a short, punchy line), and may optionally include statementEmphasis (1-3 emphasized words) and subline (a short supporting line).
3. "grid" — a small grid of short items (a checklist, a list of feelings, steps, or ideas). Needs: heading, items (3 to 6 SHORT strings, a few words each), and may optionally include highlightIndex (the index of the one item to visually emphasize) and footnote.
4. "editorial" — a premium, magazine-style layout drawn OVER A PHOTOGRAPH (not a flat or gradient fill). This is the best choice for a "here's what we do" or "here's how it helps" post — it reads as a real designed post, not an ad. Use it when the brief calls for something that feels considered and premium rather than punchy or list-like. Needs:
   - wordmark: a short script/brand mark line (usually just the brand name or a warm greeting)
   - wordmarkSubtitle: a short tracked-caps line under the wordmark (a handful of words)
   - statement: the big headline for the card — one short, confident line (this is the same field "statement" template uses; here it's the large serif headline over the photo)
   - bullets: 2 to 4 feature/benefit rows, each ONE short line. Every bullet is {text, emphasis, icon}: "text" is the full line, "emphasis" MUST be a VERBATIM SUBSTRING of that same bullet's "text" (copy the exact characters — the renderer bolds that fragment inline, and if it isn't an exact substring the whole line just renders in regular weight, so get it right), and "icon" MUST be exactly one of: heart, book, leaf, sparkle, check, sun — pick whichever best fits that line's meaning.
   - footer: a short tracked-caps closing line, roughly 6 words or fewer (e.g. "GROWN WITH CARE, SHARED WITH LOVE")
   - scrimStrength: a number 0 to 1 for how strongly to wash the photo for text legibility (0.6-0.8 is typically right; higher for busier photos)
   - photo_brief: 1-2 sentences describing the ideal PHOTOGRAPH behind this layout — a warm, real scene with actual objects and light (e.g. an open book, a mug, flowers, morning light; people optional and usually unnecessary). Compose it so the LEFT side of the frame stays calm and uncluttered, because that's where the text column sits. Describe ONLY what the camera sees — no text, graphics or logos in the scene.
   Do NOT invent or include a backgroundUrl — the app supplies the actual photograph separately. Do not use "editorial" for a verse concept; if scripture is the point of the card, use "verse" instead.
5. "list" — a numbered listicle (1, 2, 3...). Good for tips, reasons, or steps framed as a countdown. Needs: heading (the title) and bullets (2 to 4 short lines). Bullets use the SAME shape as editorial's: {text, emphasis, icon} — "emphasis" MUST be a VERBATIM SUBSTRING of that bullet's own "text" (exact characters), and "icon" MUST be exactly one of: heart, book, leaf, sparkle, check, sun. May optionally include footnote. Unlike "grid" (short standalone words/phrases arranged in a grid), a "list" reads as full sentences stacked and numbered — use it when each point deserves a real sentence, not a two-word label.
6. "conversation" — a text-message thread rendered as chat bubbles. Needs: messages (2 to 6 turns), each {side, text} where side is "left" (the other party — a friend, a worried voice, a question) or "right" (the brand's reply or answer). May optionally include heading. GUARDRAIL: every message must be ORIGINAL short copy written in the brand's voice for this concept — never a quote attributed to a real person, never a fabricated testimonial or review, never phrased to imply an actual customer said this. It's a device to dramatize a felt need and the brand's answer, not evidence of something that happened.
7. "stat" — one oversized number or short figure as the whole point of the card. Needs: statValue (the big figure itself, kept SHORT — e.g. "5", "3am", "92%" — this is the one thing the eye lands on) and subline (a short line of context explaining what the figure means). May optionally include statUnit (a short tracked label under the figure, e.g. "MINUTES", "DAYS A WEEK"). Only use a figure that's real (from the brief or brand context) or plainly illustrative/rhetorical (e.g. "1" for "one small habit, one big difference") — never present a made-up statistic as if it were researched fact.
8. "quote" — a framed pull-quote, visually distinct from "statement" (a bold headline) — "quote" is set and framed like an actual quotation. Needs: statement (the quotation text) and attribution (who or what it's from, e.g. "— REJOICE" or a short non-identifying descriptor like "— A FIRST-TIME GROWER"). May optionally include statementEmphasis (1-3 emphasized words, must be a verbatim substring of statement). Do not attribute the quote to a specific named real person unless that exact quote and person are given to you in the brief or brand context — when in doubt, attribute it to the brand itself or a generic, non-identifying descriptor.

${varietyLine}

EVERY concept, regardless of template, also needs:
- eyebrow: a short tracked label above the main content, e.g. "FOR WHEN YOU FEEL ANXIOUS"
- logoText: the brand mark line — usually just "${opts.brandName}"
- caption: a publish-ready Instagram caption with a natural, non-spammy call to action
- rationale: ONE sentence explaining the idea/angle, written for the human deciding whether to approve it
- ${paletteFieldRule}

HARD RULE — NEVER INVENT URLS, DOMAINS OR HANDLES:
Only reference a website if one is explicitly given in BRAND CONTEXT above, and copy it exactly. If none is given, do not mention any domain or URL anywhere — not in the footer, not in the caption. A made-up domain on a published card sends real people to a site that doesn't exist.

HARD RULE — NEVER WRITE SCRIPTURE TEXT:
${scriptureRule}

If a concept uses the "verse" template, you must NEVER write out the verse's wording, and must NEVER invent a "body" or "reference" string — only supply verse_ref (book_id/chapter/verse_start/verse_end). Any wording you wrote would be ignored, so a fabricated or misquoted "quote" from you accomplishes nothing except confusing the human reviewer — the app always fetches the real text itself. If you cannot confidently name a passage that genuinely fits, use "statement" or "grid" instead of "verse" for that concept. "editorial" concepts must never carry scripture text either — they are not a vehicle for verses, they're for photo-backed feature/benefit posts.

Return ONLY a JSON object of exactly this shape — no markdown, no commentary:
{"concepts": [ { ...concept 1... }, { ...concept 2... } ]}
Every concept goes inside the "concepts" array, even when there is only one.`;
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

// Validates a raw verse_ref from the model against the closed USFM_BOOKS
// vocabulary and sane numeric bounds. Returns null (never throws) for
// anything unusable — the caller demotes the concept to "statement" rather
// than ship a verse card with a bad or missing reference.
function normalizeVerseRef(raw: any): VerseReference | null {
  if (!raw || typeof raw !== 'object') return null;

  const bookId = typeof raw.book_id === 'string' ? raw.book_id.trim().toUpperCase() : '';
  if (!USFM_BOOKS.some((b) => b.id === bookId)) return null;

  const chapter = Math.trunc(Number(raw.chapter));
  if (!Number.isInteger(chapter) || chapter <= 0) return null;

  const verseStart = Math.trunc(Number(raw.verse_start));
  if (!Number.isInteger(verseStart) || verseStart <= 0) return null;

  const hasEnd = raw.verse_end !== undefined && raw.verse_end !== null && raw.verse_end !== '';
  let verseEnd: number | undefined;
  if (hasEnd) {
    verseEnd = Math.trunc(Number(raw.verse_end));
    if (!Number.isInteger(verseEnd) || verseEnd < verseStart) return null;
  }

  const span = (verseEnd ?? verseStart) - verseStart + 1;
  if (span > MAX_VERSE_SPAN) return null;

  const ref: VerseReference = { book_id: bookId, chapter, verse_start: verseStart };
  if (verseEnd !== undefined) ref.verse_end = verseEnd;
  return ref;
}

// Repairs a raw `bullets` array into a guaranteed-renderable CardBullet[]:
// malformed entries (no usable text) are dropped, the list is capped at
// MAX_BULLETS, icon is coerced into the allowed set (with a sensible
// default), and an `emphasis` that isn't an exact substring of its own
// `text` is dropped rather than shipped — the renderer bolds it inline by
// searching for that substring, so a non-matching emphasis would just
// silently fail to highlight anything.
function normalizeBullets(raw: any): CardBullet[] {
  if (!Array.isArray(raw)) return [];

  const out: CardBullet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) continue;

    const bullet: CardBullet = {
      text,
      icon: ALLOWED_BULLET_ICONS.includes(item.icon) ? item.icon : DEFAULT_BULLET_ICON,
    };

    const emphasis = typeof item.emphasis === 'string' ? item.emphasis.trim() : '';
    if (emphasis && text.includes(emphasis)) {
      bullet.emphasis = emphasis;
    }

    out.push(bullet);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
}

// Repairs a raw `messages` array into a guaranteed-renderable CardMessage[]:
// entries without usable text are dropped, `side` is coerced to 'left'
// whenever it isn't exactly 'right' (the renderer only understands those two
// values), and the list is capped — a long thread reads like a chat
// screenshot dump, not a designed card.
const MAX_MESSAGES = 6;
function normalizeMessages(raw: any): CardMessage[] {
  if (!Array.isArray(raw)) return [];

  const out: CardMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) continue;

    out.push({
      side: item.side === 'right' ? 'right' : 'left',
      text,
    });
    if (out.length >= MAX_MESSAGES) break;
  }
  return out;
}

// Clamps a raw scrimStrength to the renderer's expected 0-1 range, falling
// back to a sane default photo-legibility wash when the model omits it or
// hands back something unusable.
function normalizeScrimStrength(raw: any): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCRIM_STRENGTH;
  return Math.min(1, Math.max(0, n));
}

// Validates one raw concept from the model and repairs what it can. Returns
// null (never throws) for anything that isn't renderable even after repair —
// callers filter nulls out so one bad concept never sinks the whole batch.
// Internal — does the template-shape validation/repair. `normalizeConcept`
// below wraps this with the brand card-style stamp (fonts/palette) and the
// final template-restriction check, which needs to see the FINAL template
// after any demotion this function does.
function resolveConceptFromRaw(raw: any, model: string, cardStyle?: BrandCardStyle): CardConceptWithRef | null {
  if (!raw || typeof raw !== 'object') return null;

  const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  if (!caption) return null; // publish-ready caption is non-negotiable

  let template: CardTemplate | null =
    raw.template === 'verse' || raw.template === 'statement' || raw.template === 'grid' || raw.template === 'editorial' ||
    raw.template === 'list' || raw.template === 'conversation' || raw.template === 'stat' || raw.template === 'quote'
      ? raw.template
      : null;

  // Infer a template from whatever fields are actually present if the model
  // returned something outside the enum (defensive — schema should prevent
  // this, but never trust it blindly).
  if (!template) {
    if (raw.verse_ref && typeof raw.verse_ref === 'object') {
      template = 'verse';
    } else if (Array.isArray(raw.messages) && raw.messages.filter((m: any) => m && typeof m.text === 'string' && m.text.trim()).length >= 2) {
      template = 'conversation';
    } else if (typeof raw.statValue === 'string' && raw.statValue.trim()) {
      template = 'stat';
    } else if (Array.isArray(raw.items) && raw.items.filter((i: any) => typeof i === 'string' && i.trim()).length >= 2) {
      template = 'grid';
    } else if (Array.isArray(raw.bullets) && raw.bullets.length > 0) {
      template = 'editorial';
    } else if (typeof raw.statement === 'string' && raw.statement.trim() && typeof raw.attribution === 'string' && raw.attribution.trim()) {
      template = 'quote';
    } else if (typeof raw.statement === 'string' && raw.statement.trim()) {
      template = 'statement';
    } else {
      return null;
    }
  }

  const eyebrow = typeof raw.eyebrow === 'string' ? raw.eyebrow.trim() : '';
  const logoText = typeof raw.logoText === 'string' ? raw.logoText.trim() : '';
  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';

  // Palette: a locked brand's palette is pre-vetted and applied VERBATIM,
  // bypassing normalizePalette entirely — it never even sees raw.palette for
  // a locked brand. normalizePalette's contrast repair exists to fix a
  // model's bad guess; a locked palette isn't a guess, it's the exact pairing
  // that was eyeballed and approved. Running it through repair "just in case"
  // would let a future seed with a lower-contrast pair get silently
  // overridden at generation time — a hole in the lock. DO NOT re-add
  // normalizePalette to this branch. Expressive/unstyled brands are
  // completely unaffected: they still get the model's raw palette guess,
  // repaired for contrast, exactly as before.
  const lockedPalette = cardStyle?.palettePolicy?.mode === 'locked' ? cardStyle.palettePolicy : null;
  const palette: CardPalette = lockedPalette
    ? {
        bg1: lockedPalette.bg1,
        text: lockedPalette.text,
        muted: lockedPalette.muted,
        accent: lockedPalette.accent,
        ...(lockedPalette.bg2 ? { bg2: lockedPalette.bg2 } : {}),
      }
    : normalizePalette(raw.palette);

  const base: CardConceptWithRef = {
    id: crypto.randomUUID(),
    template,
    palette,
    eyebrow,
    logoText,
    caption,
    rationale,
    model,
  };

  // Fonts: stamp every concept with the brand's pairing (if any) so the
  // renderer draws in the brand's voice regardless of which template this
  // concept ends up as.
  if (cardStyle?.fontPairing) {
    base.fonts = { display: cardStyle.fontPairing.display, label: cardStyle.fontPairing.label };
  }

  if (template === 'verse') {
    // The model never writes verse text — only a reference. Validate it
    // against the closed USFM vocabulary and a short max span; leave
    // body/reference unset so `pages/CardStudio.tsx` can tell a card still
    // needs its real text fetched. No model may author scripture text here:
    // it's both a licensing problem (NIV is copyrighted) and an accuracy
    // problem (models paraphrase/misquote), so the database is the only
    // source of truth for wording.
    const verseRef = normalizeVerseRef(raw.verse_ref);
    if (verseRef) {
      base.verse_ref = verseRef;
      return base;
    }
    // No valid reference — demote to statement rather than drop, if there's
    // usable text to demote it with.
    const fallbackStatement = typeof raw.statement === 'string' ? raw.statement.trim() : '';
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

  if (template === 'editorial') {
    // A structured layout drawn OVER A PHOTOGRAPH — never over this
    // concept's own palette as a fill. backgroundUrl is intentionally left
    // unset here: the app (pages/CardStudio.tsx) attaches it afterward from
    // an upload or a prior Creative Studio generation, and the renderer
    // falls back to a palette gradient until then.
    const statement = typeof raw.statement === 'string' ? raw.statement.trim() : '';
    const wordmark = typeof raw.wordmark === 'string' ? raw.wordmark.trim() : '';
    const wordmarkSubtitle = typeof raw.wordmarkSubtitle === 'string' ? raw.wordmarkSubtitle.trim() : '';
    const footer = typeof raw.footer === 'string' ? raw.footer.trim() : '';
    const bullets = normalizeBullets(raw.bullets);
    const scrimStrength = normalizeScrimStrength(raw.scrimStrength);

    // Not renderable as editorial without at least a headline-ish field (the
    // big serif "statement" headline or the wordmark line) — demote to
    // "statement" rather than drop, the same way an invalid verse concept is
    // demoted rather than lost.
    //
    // Bullets are NOT required to keep the editorial template. The prompt
    // asks for 2-4, and the schema hints minItems/maxItems, but Gemini's
    // structured-output layer doesn't reliably enforce array length even
    // when the field is present, so a model can legally return an empty
    // array. drawEditorial() already tolerates zero bullets (bulletsBlockH
    // is just 0 — no crash, no layout break), so there's no real reason to
    // throw away the photo layout, wordmark and headline over a missing
    // bullet list. Demoting here was blocking a perfectly renderable card.
    const hasHeadline = !!statement || !!wordmark;
    if (!hasHeadline) {
      const fallbackStatement = statement || wordmark || eyebrow || caption;
      if (!fallbackStatement) return null;
      base.template = 'statement';
      base.statement = fallbackStatement;
      // The original rationale describes an editorial/photo concept that no
      // longer exists once demoted — leaving it verbatim would tell the
      // reviewer this card has a photo treatment it doesn't have.
      base.rationale = rationale
        ? `${rationale} (Simplified to a plain statement — no headline or wordmark to build the editorial layout around.)`
        : 'Simplified to a plain statement — no headline or wordmark to build the editorial layout around.';
      return base;
    }

    if (statement) base.statement = statement;
    // `drawEditorial` draws its big serif headline from `heading`, not
    // `statement` — the prompt asks for the headline under the name
    // "statement" (shared with the statement template), so mirror it into
    // `heading` here. Without this an editorial concept renders headline-less
    // unless something downstream supplies one, which is exactly what the
    // brand-direction presets were silently compensating for.
    if (statement) base.heading = statement;
    if (wordmark) base.wordmark = wordmark;
    if (wordmarkSubtitle) base.wordmarkSubtitle = wordmarkSubtitle;
    base.bullets = bullets;
    if (footer) base.footer = footer;
    if (typeof raw.photo_brief === 'string' && raw.photo_brief.trim()) base.photo_brief = raw.photo_brief.trim();
    base.scrimStrength = scrimStrength;
    return base;
  }

  if (template === 'list') {
    // A numbered listicle — reuses the same CardBullet shape as editorial's
    // feature rows (drawn with numbers instead of icons). Needs at least two
    // bullets to read as a list rather than a single stray line.
    const bullets = normalizeBullets(raw.bullets);
    if (bullets.length >= 2) {
      base.heading = typeof raw.heading === 'string' ? raw.heading.trim() : '';
      base.bullets = bullets;
      if (typeof raw.footnote === 'string' && raw.footnote.trim()) base.footnote = raw.footnote.trim();
      return base;
    }
    // Fewer than two usable bullets isn't renderable as a list — demote to
    // statement rather than drop, the same way verse/editorial demote when
    // their required data is missing but there's still usable text.
    const fallbackStatement = (typeof raw.heading === 'string' && raw.heading.trim()) || caption;
    if (!fallbackStatement) return null;
    base.template = 'statement';
    base.statement = fallbackStatement;
    return base;
  }

  if (template === 'conversation') {
    // A text-message thread — needs at least two turns to read as a
    // conversation rather than one caption fragment.
    const messages = normalizeMessages(raw.messages);
    if (messages.length >= 2) {
      base.messages = messages;
      if (typeof raw.heading === 'string' && raw.heading.trim()) base.heading = raw.heading.trim();
      return base;
    }
    // Not enough messages to render the thread — demote to statement rather
    // than drop, using whatever heading or caption text is available.
    const fallbackStatement = (typeof raw.heading === 'string' && raw.heading.trim()) || caption;
    if (!fallbackStatement) return null;
    base.template = 'statement';
    base.statement = fallbackStatement;
    return base;
  }

  if (template === 'stat') {
    // One oversized figure — the whole card is built around statValue, so
    // without it there's nothing left to draw.
    const statValue = typeof raw.statValue === 'string' ? raw.statValue.trim().slice(0, 12) : '';
    if (statValue) {
      base.statValue = statValue;
      if (typeof raw.statUnit === 'string' && raw.statUnit.trim()) base.statUnit = raw.statUnit.trim().slice(0, 24);
      if (typeof raw.subline === 'string' && raw.subline.trim()) base.subline = raw.subline.trim();
      return base;
    }
    // No figure to build the card around — demote to statement rather than
    // drop, using whatever context line or caption exists.
    const fallbackStatement = (typeof raw.subline === 'string' && raw.subline.trim()) || caption;
    if (!fallbackStatement) return null;
    base.template = 'statement';
    base.statement = fallbackStatement;
    return base;
  }

  if (template === 'quote') {
    // A framed pull-quote — reuses `statement` for the quotation itself.
    const statement = typeof raw.statement === 'string' ? raw.statement.trim() : '';
    if (statement) {
      base.statement = statement;
      if (typeof raw.statementEmphasis === 'string' && raw.statementEmphasis.trim()) base.statementEmphasis = raw.statementEmphasis.trim();
      if (typeof raw.attribution === 'string' && raw.attribution.trim()) base.attribution = raw.attribution.trim();
      return base;
    }
    // A quote's only required field IS the statement text, so there's
    // nothing usable left to demote to (unlike list/conversation/stat, which
    // can fall back to a heading or caption) — drop it rather than ship an
    // empty frame.
    return null;
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

// Belt-and-braces enforcement of a brand's template restriction. The prompt
// already tells the model which templates it may use, but the model can
// slip — and resolveConceptFromRaw's own repair logic can ALSO land a
// concept on a non-restricted template via a demotion (e.g. an invalid verse
// falls back to "statement", which is fine for an open brand but might not be
// in a restricted brand's allowed set). So this runs last, against the
// FINAL resolved template, same discipline as the scripture-avoid demotion in
// generateCardConcepts below: prefer keeping the concept over dropping it.
function enforceTemplateRestriction(concept: CardConceptWithRef, cardStyle?: BrandCardStyle): CardConceptWithRef {
  const policy = cardStyle?.templatePolicy;
  if (!policy || policy.mode !== 'restricted') return concept;
  if (policy.allowed.includes(concept.template)) return concept;

  // Prefer "statement" — it's the universal fallback every other demotion
  // path in resolveConceptFromRaw already uses — otherwise fall back to
  // whatever else the brand does allow.
  const preferStatement = policy.allowed.includes('statement');
  const target: CardTemplate | undefined = preferStatement ? 'statement' : policy.allowed[0];
  if (!target) return concept; // brand allows nothing at all — nothing sane to demote to, ship as-is

  const originalTemplate = concept.template;
  const salvagedStatement =
    concept.statement || concept.wordmark || concept.heading ||
    (concept.items && concept.items[0]) || concept.eyebrow || concept.caption;

  const demoted: CardConceptWithRef = {
    ...concept,
    template: target,
    rationale: concept.rationale
      ? `${concept.rationale} (Template swapped to "${target}" — "${originalTemplate}" isn't in this brand's allowed set.)`
      : `Template swapped to "${target}" — "${originalTemplate}" isn't in this brand's allowed set.`,
  };

  if (target === 'statement') {
    // "statement" only draws from `statement` — clear the fields from
    // whatever template this used to be so a leftover verse_ref/bullets/
    // items/messages doesn't confuse the renderer.
    demoted.statement = salvagedStatement || concept.caption;
    delete demoted.verse_ref;
    delete demoted.items;
    delete demoted.bullets;
    delete demoted.messages;
    delete demoted.wordmark;
    delete demoted.wordmarkSubtitle;
    delete demoted.footer;
    delete demoted.scrimStrength;
    delete demoted.statValue;
    delete demoted.statUnit;
    delete demoted.attribution;
    delete demoted.highlightIndex;
  } else {
    // Demoting to some other allowed template: salvage whatever fields
    // already fit rather than dropping the concept — every field the
    // original template set stays on the object, only `template` changes, so
    // the renderer draws whatever of it applies to the new template's shape.
    // Also carry a `statement` fallback since several templates read it.
    if (!demoted.statement && salvagedStatement) demoted.statement = salvagedStatement;
    // ...and `heading` alongside it, because "editorial" (the usual demotion
    // target for a direction-restricted brand) draws its headline from
    // `heading`, not `statement`. Without this, a concept arriving here — a
    // verse the brand can't render, say — lands on editorial with no headline
    // at all and silently falls back to the direction's stock line.
    if (!demoted.heading && (demoted.statement || salvagedStatement)) {
      demoted.heading = demoted.statement || salvagedStatement;
    }
    // A verse reference is meaningless on any non-verse template and would
    // leave the card asking to be hydrated with scripture it will never draw.
    if (target !== 'verse') delete demoted.verse_ref;
  }

  return demoted;
}

// Validates one raw concept from the model, repairs the template shape, then
// stamps and enforces the brand's card style (fonts, locked palette, template
// restriction). This is the function callers use — resolveConceptFromRaw and
// enforceTemplateRestriction are internal steps of it.
function normalizeConcept(raw: any, model: string, cardStyle?: BrandCardStyle): CardConceptWithRef | null {
  const concept = resolveConceptFromRaw(raw, model, cardStyle);
  if (!concept) return null;
  return enforceTemplateRestriction(concept, cardStyle);
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
  scripturePolicy?: ScripturePolicy;
  cardStyle?: BrandCardStyle;
}): Promise<CardConceptWithRef[]> {
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

    // WHY NO responseSchema: the head/tail runaway logging caught the model
    // degenerating mid-generation — it flipped into Chinese and repeated one
    // fragment ("英文版建议文字：A SPACE FOR YOUR SOUL...") hundreds of times
    // until the token budget died. That's a known constrained-decoding failure
    // when a LARGE schema with many optional fields (ours carries every
    // template's fields on every concept) meets a thinking model. JSON mode
    // alone (responseMimeType) still guarantees syntactically valid JSON, and
    // normalizeConcept() already validates/repairs every field — so the schema
    // was redundant enforcement that was actively breaking generation.
    //
    // Fallback chain mirrors SocialHub's proven CONTENT_MODELS pattern: retry
    // once on the older model, which doesn't exhibit the degeneration. One
    // retry only — a failed 20k-token attempt isn't free.
    const DIRECTOR_MODELS = [MODEL, 'gemini-2.5-flash'];
    const GENERATION_TIMEOUT_MS = 90_000;
    // Generous because THINKING TOKENS COME OUT OF THIS BUDGET on
    // gemini-3-flash-preview (a 4k cap truncated a single concept at 6.8k
    // chars). This is a runaway guard, not a cost control.
    const maxOutputTokens = Math.min(48000, 12000 * count + 8000);

    let lastError: Error | null = null;
    for (const model of DIRECTOR_MODELS) {
      try {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              // Explicit, moderate temperature — the degeneration loop is a
              // sampling failure, and the SDK default leaves it to the model.
              temperature: 0.7,
              maxOutputTokens,
            },
          }),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Gemini did not respond within ${GENERATION_TIMEOUT_MS / 1000}s — request timed out.`)),
              GENERATION_TIMEOUT_MS,
            );
          }),
        ]).finally(() => { if (timeoutHandle) clearTimeout(timeoutHandle); });

        const rawText = response.text || '{}';
        console.log(`[creativeDirector] ${model} responded, raw length:`, rawText.length);
        if (rawText.length > 20_000) {
          console.warn('[creativeDirector] RUNAWAY head:', rawText.slice(0, 400));
          console.warn('[creativeDirector] RUNAWAY tail:', rawText.slice(-400));
        }

        let rawConcepts: any[];
        try {
          const parsed = JSON.parse(rawText);
          // Accept every envelope the model actually produces, not just the
          // requested one. Without a responseSchema the wrapper is only a
          // prompt instruction, and with count=1 the model readily returns the
          // bare concept object itself — which is valid JSON, parses fine, and
          // then died here as "concepts raw: 0" when only {concepts:[...]} was
          // accepted.
          if (Array.isArray(parsed?.concepts)) rawConcepts = parsed.concepts;
          else if (Array.isArray(parsed)) rawConcepts = parsed;
          else if (parsed && typeof parsed === 'object' && typeof parsed.template === 'string') rawConcepts = [parsed];
          else rawConcepts = [];
          if (rawConcepts.length === 0) {
            console.warn('[creativeDirector] parsed OK but no concepts found — response head:', rawText.slice(0, 300));
          }
        } catch (parseErr) {
          // A runaway response degenerates AFTER writing good concepts: the
          // observed failures start with a perfectly-formed first concept and
          // then loop (repeated fragments, or endless extra array items) until
          // the token budget kills the stream mid-structure. So don't throw the
          // whole response away — salvage the complete objects from the front
          // of the concepts array. This turns "the model misbehaved" from a
          // hard failure into, usually, exactly the concepts asked for.
          rawConcepts = salvageConceptObjects(rawText);
          console.warn(`[creativeDirector] response unparseable (${rawText.length.toLocaleString()} chars) — salvaged ${rawConcepts.length} complete concept(s)`);
          if (rawConcepts.length === 0) {
            const trimmed = rawText.trimEnd();
            const looksTruncated = !trimmed.endsWith('}') && !trimmed.endsWith(']');
            throw new Error(
              looksTruncated
                ? `The director's response was cut off mid-answer (${rawText.length.toLocaleString()} characters) and nothing usable could be recovered.`
                : `Could not parse the director's response: ${parseErr instanceof Error ? parseErr.message : 'invalid JSON'}`,
            );
          }
        }
        // A degenerating model may also produce MORE array items than asked for
        // (observed: count=1 request, second concept mid-stream at 60k chars).
        // Never keep more than requested.
        if (rawConcepts.length > count) rawConcepts = rawConcepts.slice(0, count);

        const concepts: CardConceptWithRef[] = [];
        for (const raw of rawConcepts) {
          const concept = normalizeConcept(raw, model, opts.cardStyle);
          if (!concept) continue;
          // Belt and braces: a prompt rule is a request, not a guarantee. With no
          // Bible source a verse card can never render, so demote rather than ship
          // a card that is certain to fail.
          if (opts.scripturePolicy === 'avoid' && concept.template === 'verse') {
            concept.template = 'statement';
            concept.statement = concept.statement || concept.eyebrow || concept.caption;
            delete (concept as any).verse_ref;
          }
          concepts.push(concept);
        }
        // Raw vs kept: normalizeConcept drops anything unrenderable, so a gap
        // between these two numbers is where concepts silently disappear.
        console.log('[creativeDirector] concepts raw:', rawConcepts.length, 'kept:', concepts.length,
          concepts.map((c) => c.template));
        if (concepts.length === 0 && rawConcepts.length > 0) {
          throw new Error('Every returned concept failed validation.');
        }
        return concepts;
      } catch (attemptErr) {
        lastError = attemptErr instanceof Error ? attemptErr : new Error(String(attemptErr));
        console.warn(`[creativeDirector] ${model} attempt failed:`, lastError.message);
      }
    }
    throw lastError ?? new Error('All director models failed.');
  } catch (err) {
    throw new Error(err instanceof Error ? `Card concept generation failed: ${err.message}` : 'Card concept generation failed.');
  }
}

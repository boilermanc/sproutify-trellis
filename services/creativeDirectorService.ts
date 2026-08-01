import { GoogleGenAI, Type } from '@google/genai';
import { CardBullet, CardConcept, CardPalette, CardTemplate } from '../types';
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
}): string {
  const bookVocab = USFM_BOOKS.map((b) => `${b.id} (${b.name})`).join(', ');

  const policy = opts.scripturePolicy || 'mix';
  const scriptureRule =
    policy === 'avoid'
      ? 'SCRIPTURE POLICY: do NOT use the "verse" template at all for this batch. Use only "statement", "grid" and "editorial". Do not quote or reference scripture anywhere, including in captions.'
      : policy === 'require'
      ? 'SCRIPTURE POLICY: every concept should use the "verse" template, unless you genuinely cannot name a fitting passage — in that case use "statement" for that one rather than forcing a bad fit.'
      : 'SCRIPTURE POLICY: mix the templates. Not every post needs scripture — a batch of all verse cards is monotonous. Aim for a spread across "verse", "statement", "grid" and "editorial".';

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
   Do NOT invent or include a backgroundUrl — the app supplies the actual photograph separately. Do not use "editorial" for a verse concept; if scripture is the point of the card, use "verse" instead.

EVERY concept, regardless of template, also needs:
- eyebrow: a short tracked label above the main content, e.g. "FOR WHEN YOU FEEL ANXIOUS"
- logoText: the brand mark line — usually just "${opts.brandName}"
- caption: a publish-ready Instagram caption with a natural, non-spammy call to action
- rationale: ONE sentence explaining the idea/angle, written for the human deciding whether to approve it
- palette: {bg1, bg2 (optional gradient end), text, muted, accent} — real CSS hex colors (e.g. "#1c2b23"). text and bg1 MUST have strong, obviously readable contrast. Each concept's palette is its OWN choice and does not need to match the brand's colors or any other concept's palette — but it must be internally consistent (muted and accent should make sense against bg1, not clash or disappear). For "editorial" concepts the palette still matters (it colors the wordmark, headline and footer band over the photo scrim), even though the background itself is a photo, not this palette.

HARD RULE — NEVER WRITE SCRIPTURE TEXT:
${scriptureRule}

If a concept uses the "verse" template, you must NEVER write out the verse's wording, and must NEVER invent a "body" or "reference" string — only supply verse_ref (book_id/chapter/verse_start/verse_end). Any wording you wrote would be ignored, so a fabricated or misquoted "quote" from you accomplishes nothing except confusing the human reviewer — the app always fetches the real text itself. If you cannot confidently name a passage that genuinely fits, use "statement" or "grid" instead of "verse" for that concept. "editorial" concepts must never carry scripture text either — they are not a vehicle for verses, they're for photo-backed feature/benefit posts.

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
function normalizeConcept(raw: any, model: string): CardConceptWithRef | null {
  if (!raw || typeof raw !== 'object') return null;

  const caption = typeof raw.caption === 'string' ? raw.caption.trim() : '';
  if (!caption) return null; // publish-ready caption is non-negotiable

  let template: CardTemplate | null =
    raw.template === 'verse' || raw.template === 'statement' || raw.template === 'grid' || raw.template === 'editorial'
      ? raw.template
      : null;

  // Infer a template from whatever fields are actually present if the model
  // returned something outside the enum (defensive — schema should prevent
  // this, but never trust it blindly).
  if (!template) {
    if (raw.verse_ref && typeof raw.verse_ref === 'object') {
      template = 'verse';
    } else if (Array.isArray(raw.items) && raw.items.filter((i: any) => typeof i === 'string' && i.trim()).length >= 2) {
      template = 'grid';
    } else if (Array.isArray(raw.bullets) && raw.bullets.length > 0) {
      template = 'editorial';
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
    if (wordmark) base.wordmark = wordmark;
    if (wordmarkSubtitle) base.wordmarkSubtitle = wordmarkSubtitle;
    base.bullets = bullets;
    if (footer) base.footer = footer;
    base.scrimStrength = scrimStrength;
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
  scripturePolicy?: ScripturePolicy;
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

    // The SDK call has no timeout of its own, so a stalled request hangs
    // forever: the button sits disabled on "already generating", nothing
    // resolves, nothing rejects, and no error ever surfaces. Race it so a
    // stall becomes a real, reportable failure instead of a silent freeze.
    const GENERATION_TIMEOUT_MS = 90_000;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: CARD_CONCEPTS_SCHEMA,
          // Bounded so a runaway can't reach the model's own ceiling again —
          // but generously, because THINKING TOKENS COME OUT OF THIS BUDGET on
          // gemini-3-flash-preview. A first attempt at 2.5k/concept truncated
          // one concept at ~6.8k characters: reasoning had eaten most of the
          // allowance before any JSON was written. This is a runaway guard,
          // not a cost control, so it should sit far above what a well-behaved
          // response needs.
          maxOutputTokens: Math.min(48000, 12000 * count + 8000),
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
    console.log('[creativeDirector] Gemini responded, raw length:', rawText.length);

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      // Detect truncation by SHAPE, not length. A response cut off at the token
      // ceiling simply stops mid-structure, so it won't close its JSON — that's
      // true whether it died at 6k characters or 190k, and an earlier
      // length-threshold check wrongly reported a 6.8k truncation as a generic
      // parse error.
      const trimmed = rawText.trimEnd();
      const looksTruncated = !trimmed.endsWith('}') && !trimmed.endsWith(']');
      throw new Error(
        looksTruncated
          ? `The director's response was cut off mid-answer (${rawText.length.toLocaleString()} characters). It ran out of output budget — try fewer concepts or a shorter brief.`
          : `Could not parse the director's response: ${parseErr instanceof Error ? parseErr.message : 'invalid JSON'}`,
      );
    }
    const rawConcepts: any[] = Array.isArray(parsed?.concepts) ? parsed.concepts : [];

    const concepts: CardConceptWithRef[] = [];
    for (const raw of rawConcepts) {
      const concept = normalizeConcept(raw, MODEL);
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
    return concepts;
  } catch (err) {
    throw new Error(err instanceof Error ? `Card concept generation failed: ${err.message}` : 'Card concept generation failed.');
  }
}

import { GoogleGenAI } from '@google/genai';
import {
  ClipProject, ClipSource, ClipGeneration, ClipScriptBeat, ClipProjectStatus,
  CreateClipConfig, ClipBrollBeat, ClipBeatType, ClipTriage, ClipRenderJob,
  ClipPublication, ClipTemplateParams, ClipAudioConfig, MusicGeneration,
  ClipScene, SceneElement,
} from '../types';
import { CLIP_PUBLISH_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';
import { sanitizePII } from './aiService';
import { resolveClipBrand, ClipBrand } from './clipBrand';
import { submitMusicJob, pollMusicJob } from './musicService';

// ─── Clip Studio Service ────────────────────────────────────────────
// A clip project is script-first: sources → AI cut sheet (with fact
// checks, receipts, hook alternatives) → approve → B-roll (Phase C2)
// → render (C3) → publish (C4). This file covers Phase C1: projects,
// sources, and versioned script generations via Gemini.
// ─────────────────────────────────────────────────────────────────────

const SCRIPT_MODEL = 'gemini-3-flash-preview';
const SOURCE_CHAR_CAP = 60_000; // per source, keeps the prompt inside context comfortably
const WORDS_PER_SECOND = 2.5;   // ~150 wpm spoken pace for read-time estimates

// ─── CRUD ───────────────────────────────────────────────────────────
export async function createClipProject(config: CreateClipConfig, createdBy?: string | null): Promise<ClipProject> {
  const { data, error } = await supabase.from('trellis_clip_projects').insert({
    branch: config.branch,
    created_by: createdBy ?? null,
    steering: config.steering ?? null,
    target_seconds: config.target_seconds,
    format: config.format,
    status: 'draft',
  }).select('*').single();
  if (error || !data) throw new Error(`Could not create clip project: ${error?.message}`);
  const project = data as ClipProject;

  // Sources get stable S1..Sn labels — the script's receipts refer to these.
  const rows = config.sources.map((s, i) => ({
    project_id: project.id,
    kind: s.kind,
    label: `S${i + 1}`,
    url: s.url ?? null,
    filename: s.filename ?? null,
    raw_text: s.raw_text ?? null,
  }));
  if (rows.length) {
    const { error: srcErr } = await supabase.from('trellis_clip_sources').insert(rows);
    if (srcErr) throw new Error(`Could not save sources: ${srcErr.message}`);
  }
  return project;
}

export async function getClipProjects(limit = 100): Promise<ClipProject[]> {
  const { data, error } = await supabase.from('trellis_clip_projects').select('*')
    .order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to list clip projects: ${error.message}`);
  return (data as ClipProject[]) ?? [];
}

export async function getClipSources(projectId: string): Promise<ClipSource[]> {
  const { data, error } = await supabase.from('trellis_clip_sources').select('*')
    .eq('project_id', projectId).order('label');
  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return (data as ClipSource[]) ?? [];
}

export async function getClipGenerations(projectId: string): Promise<ClipGeneration[]> {
  const { data, error } = await supabase.from('trellis_clip_generations').select('*')
    .eq('project_id', projectId).order('version', { ascending: false });
  if (error) throw new Error(`Failed to load generations: ${error.message}`);
  return (data as ClipGeneration[]) ?? [];
}

export async function setClipStatus(id: string, status: ClipProjectStatus): Promise<void> {
  await supabase.from('trellis_clip_projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function setClipRating(id: string, rating: number | null): Promise<void> {
  await supabase.from('trellis_clip_projects').update({ rating, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function approveScript(projectId: string): Promise<void> {
  await setClipStatus(projectId, 'approved');
}

export async function archiveClipProject(id: string): Promise<void> {
  await setClipStatus(id, 'archived');
}

// ─── URL sources: fetch page text server-side (reuses scrape-site) ──
export async function fetchUrlSourceText(url: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('scrape-site', { body: { url } });
  if (error) throw new Error(`Could not fetch ${url}: ${error.message}`);
  const text = [data?.title, data?.description, data?.text].filter(Boolean).join('\n\n');
  if (!text.trim()) throw new Error(`No readable text found at ${url}`);
  return text;
}

// ─── Script generation (Gemini → versioned cut sheet) ───────────────
function countWords(beats: ClipScriptBeat[]): number {
  return beats.reduce((n, b) => n + b.text.trim().split(/\s+/).filter(Boolean).length, 0);
}

function buildPrompt(project: ClipProject, sources: ClipSource[], brand: ClipBrand, feedback?: string, prior?: ClipGeneration): string {
  const srcBlock = sources.map(s =>
    `--- SOURCE ${s.label} (${s.kind}${s.filename ? `: ${s.filename}` : s.url ? `: ${s.url}` : ''}) ---\n${sanitizePII((s.raw_text || '').slice(0, SOURCE_CHAR_CAP))}`
  ).join('\n\n');

  // Ground the script in the brand's own identity so the voice, and the CTA,
  // come out as this brand rather than a generic creator.
  const brandLines = [
    brand.name ? `- This short is for ${brand.name}${brand.tagline ? ` — "${brand.tagline}"` : ''}. Write in its voice, as the brand, not a neutral narrator.` : '',
    brand.tone ? `- Brand tone: ${brand.tone}. Keep every A-roll line consistent with it.` : '',
    brand.cta ? `- When the closing CTA is needed, use or naturally adapt the brand's own: "${brand.cta}".` : '',
  ].filter(Boolean).join('\n');

  const fmt = project.format?.kinds || [];
  // Promotion leans on the brand identity first, falling back to the manual
  // sponsor field only when there is no brand to speak for.
  const sponsorName = project.format?.sponsor || brand.name || '';
  const formatLines = [
    fmt.includes('interview') ? '- Interview format: interleave the creator\'s A-roll lines with VERBATIM quotes (SOT) from the source speakers. Never paraphrase inside a SOT beat.' : '',
    fmt.includes('promotion') ? `- Promotion format: naturally weave in ${sponsorName ? `"${sponsorName}"` : 'the sponsor'}. Talking points: ${project.format?.talking_points || (brand.tagline ? brand.tagline : 'n/a')}. Keep it one short, honest beat — not an ad read.` : '',
  ].filter(Boolean).join('\n');

  const revision = feedback && prior ? `
THIS IS A REVISION. The previous script (v${prior.version}) is below. Apply the creator's feedback while keeping the formula, hook strength, and target length intact.
CREATOR FEEDBACK: ${sanitizePII(feedback)}
PREVIOUS SCRIPT: ${JSON.stringify(prior.script)}
` : '';

  return `You are a short-form video script editor for a creator. Turn the source material into an "Interview Cut Sheet" for a vertical video (YouTube Short).

TARGET: ~${project.target_seconds} seconds spoken (~${Math.round(project.target_seconds * WORDS_PER_SECOND)} words total across all beats).
${project.steering ? `ANGLE / STEERING: ${sanitizePII(project.steering)}` : ''}
${brandLines ? `BRAND:\n${brandLines}` : ''}
${formatLines}
${revision}
STRUCTURAL FORMULA (follow it, then summarize how you applied it in "formula"):
- The hook lands in the FIRST sentence with a concrete, non-obvious consequence — never a headline recap.
- Use a concrete everyday scenario to make the mechanism tangible.
- Creator A-roll is short connective tissue only; the middle should lean on source quotes if the sources contain quotable speakers.
- End by opening a curiosity loop plus a follow CTA, not a summary.

RULES:
- lane "aroll" = lines the creator records (speaker "YOU"). lane "sot" = VERBATIM quotes from a named source speaker (only if the sources contain direct quotes; otherwise use aroll only).
- Every factual claim must trace to a source: set source_label (S1, S2…) on the beat and add a matching receipt with the EXACT quote from that source.
- rationale on each beat: one sentence on why this cut / what was trimmed / any risk flag.
- fact_checks: claims the creator must verify before recording — possibly misheard names, single-source claims to soften, off-the-cuff numbers, forward-looking statements to frame as predictions, hypotheticals not to present as shipped products.
- hooks: 4-6 alternative opening lines, each labeled with its archetype (e.g. "question · Naive Question to Mechanism", "stakes · News Event to Stakes", "before-after", "secret-cost").

SOURCES:
${srcBlock}

Return ONLY raw JSON, no markdown fences:
{"title":"short working title","hook_line":"the opening hook sentence","formula":"2-4 sentence summary of the structure used","beats":[{"lane":"aroll","speaker":"YOU","text":"...","rationale":"...","source_label":"S1"}],"fact_checks":[{"claim":"...","advice":"verify/soften/omit guidance"}],"hooks":[{"archetype":"...","text":"...","rationale":"..."}],"receipts":[{"source_label":"S1","claim":"...","quote":"exact verbatim excerpt"}]}`;
}

export async function generateScript(
  project: ClipProject,
  sources: ClipSource[],
  geminiApiKey: string,
  feedback?: string,
  prior?: ClipGeneration,
): Promise<ClipGeneration> {
  if (!geminiApiKey) throw new Error('Gemini API key missing — add it in Settings');
  if (!sources.length) throw new Error('This project has no sources');

  const brand = await resolveClipBrand(project.branch);
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({
    model: SCRIPT_MODEL,
    contents: buildPrompt(project, sources, brand, feedback, prior),
    // Higher temperature so repeat generations explore genuinely different
    // hooks and cuts instead of converging on one safe shape.
    config: { responseMimeType: 'application/json', temperature: 0.9 },
  });
  const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let j: {
    title?: string; hook_line?: string; formula?: string;
    beats?: ClipScriptBeat[]; fact_checks?: unknown[]; hooks?: unknown[]; receipts?: unknown[];
  };
  try { j = JSON.parse(raw); } catch { throw new Error('The model returned an unreadable script — try again'); }
  const beats: ClipScriptBeat[] = Array.isArray(j.beats) ? j.beats.map((b): ClipScriptBeat => ({
    lane: b.lane === 'sot' ? 'sot' : 'aroll',
    speaker: String(b.speaker || 'YOU'),
    text: String(b.text || ''),
    rationale: String(b.rationale || ''),
    source_label: b.source_label ? String(b.source_label) : null,
  })).filter(b => b.text.trim()) : [];
  if (!beats.length) throw new Error('The model returned an empty script — try again');

  const wordCount = countWords(beats);
  const version = (prior?.version ?? 0) + 1;
  const tokens = (resp as unknown as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata?.totalTokenCount ?? null;

  // New version becomes current; older ones stay in history.
  await supabase.from('trellis_clip_generations').update({ is_current: false }).eq('project_id', project.id);
  const { data, error } = await supabase.from('trellis_clip_generations').insert({
    project_id: project.id,
    version,
    model: SCRIPT_MODEL,
    script: beats,
    fact_checks: Array.isArray(j.fact_checks) ? j.fact_checks : [],
    hooks: Array.isArray(j.hooks) ? j.hooks : [],
    receipts: Array.isArray(j.receipts) ? j.receipts : [],
    formula: j.formula || null,
    feedback_prompt: feedback || null,
    word_count: wordCount,
    est_seconds: Math.round(wordCount / WORDS_PER_SECOND),
    tokens_used: tokens,
    is_current: true,
  }).select('*').single();
  if (error || !data) throw new Error(`Could not save script: ${error?.message}`);
  const gen = data as ClipGeneration;

  await supabase.from('trellis_clip_projects').update({
    title: j.title || project.title,
    hook_line: j.hook_line || project.hook_line,
    status: 'scripting',
    current_generation_id: gen.id,
    updated_at: new Date().toISOString(),
  }).eq('id', project.id);
  return gen;
}

export async function setCurrentGeneration(projectId: string, generationId: string): Promise<void> {
  await supabase.from('trellis_clip_generations').update({ is_current: false }).eq('project_id', projectId);
  await supabase.from('trellis_clip_generations').update({ is_current: true }).eq('id', generationId);
  await supabase.from('trellis_clip_projects').update({ current_generation_id: generationId, updated_at: new Date().toISOString() }).eq('id', projectId);
}

// ═══ Phase C2: B-roll planner ════════════════════════════════════════

const BEAT_TYPES: ClipBeatType[] = [
  'motion_graphic', 'kinetic_quote_card', 'animation', 'ui_callout',
  'timeline', 'source_receipt_card', 'text_highlight',
];

export async function getBrollBeats(projectId: string): Promise<ClipBrollBeat[]> {
  const { data, error } = await supabase.from('trellis_clip_broll_beats').select('*')
    .eq('project_id', projectId).order('position');
  if (error) throw new Error(`Failed to load B-roll beats: ${error.message}`);
  return (data as ClipBrollBeat[]) ?? [];
}

export async function updateBrollBeat(id: string, patch: Partial<Pick<ClipBrollBeat, 'remotion_prompt' | 'template_params' | 'triage'>>): Promise<void> {
  const { error } = await supabase.from('trellis_clip_broll_beats')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Could not update beat: ${error.message}`);
}

export async function setBeatTriage(id: string, triage: ClipTriage): Promise<void> {
  await updateBrollBeat(id, { triage });
}

function brollPrompt(project: ClipProject, generation: ClipGeneration, brand: ClipBrand): string {
  return `You are a motion-design director planning B-roll for a vertical (1080x1920) YouTube Short${brand.name ? ` for ${brand.name}` : ''}. For each script beat below, design ONE B-roll visual rendered by a fixed library of Remotion templates.

TEMPLATE LIBRARY (pick beat_type per beat, fill template_params — only the fields that template uses):
- motion_graphic: bold abstract visual with a phrase. params: headline (short phrase from the script), subtext (optional), accent, bg.
- kinetic_quote_card: verbatim quote with cascading word reveal. params: quote (EXACT quote text), attribution (speaker, org), highlight_words (2-4 words from the quote to color-shift), accent, bg.
- animation: layered/orbiting shapes illustrating a concept. params: headline, subtext, accent, bg.
- ui_callout: phone-style notification/message mock. params: headline (the message text), subtext (sender/app label), accent, bg.
- timeline: horizontal progression of eras/steps. params: headline, items (3-6 of {label, sublabel}), accent, bg.
- source_receipt_card: document-style receipt proving a claim. params: quote (the verbatim source line), attribution (source name), headline (the claim), accent, bg.
- text_highlight: a sentence with key words highlighted. params: headline (the sentence), highlight_words, accent, bg.

RULES:
- One beat per script beat, in order. time_start/time_end in seconds, contiguous, total ≈ ${project.target_seconds}s. Each beat 3-8 seconds.
- Match the treatment to the content — vary beat_type across the sequence, don't repeat one template. SOT script beats (verbatim quotes) usually want kinetic_quote_card or source_receipt_card; a progression of steps/eras wants timeline; a single punchy line wants motion_graphic or text_highlight.
- Colors are the brand's — the background is ${brand.bg} on every beat. Pick each beat's accent from this brand palette: ${brand.accents.join(', ')}. Vary the accent across beats using only these colors; never invent other colors.
- remotion_prompt: 2-4 sentence human-readable direction describing composition, motion and timing (like a brief to a motion designer). Make each one specific to THIS beat's content — no boilerplate.
- footage_prompts: 1-2 prompts for REAL footage (Seedance/Veo lane) only where motion graphics can't fake it (real places, hands, products, reactions); else [].
- Fill EVERY field the chosen beat_type needs (quote for kinetic_quote_card and source_receipt_card; items for timeline; highlight_words drawn verbatim from the text for kinetic_quote_card and text_highlight). Visible text only from the script — no invented labels, stats or captions.

SCRIPT BEATS:
${JSON.stringify(generation.script.map((b, i) => ({ index: i, lane: b.lane, speaker: b.speaker, text: b.text })))}

Return ONLY raw JSON, no markdown fences:
{"beats":[{"position":0,"time_start":0,"time_end":6,"beat_type":"motion_graphic","headline":"exact script phrase this covers","rationale":"why this treatment","remotion_prompt":"...","template_params":{"headline":"...","accent":"${brand.accents[0]}","bg":"${brand.bg}"},"footage_prompts":["..."]}]}`;
}

// Normalize a word the same way the templates do when matching highlights, so
// a highlight word only survives if it will actually light up on screen.
function normWord(w: string): string {
  return w.toLowerCase().replace(/[^\w']/g, '');
}

// Keep only highlight words that literally appear in `text` — the templates
// highlight per-rendered-word, so a word not present just renders as nothing.
function validHighlights(text: string, words: unknown): string[] {
  if (!Array.isArray(words)) return [];
  const present = new Set(text.split(/\s+/).map(normWord).filter(Boolean));
  const out: string[] = [];
  for (const w of words) {
    for (const part of String(w ?? '').split(/\s+/)) {
      const n = normWord(part);
      if (n && present.has(n) && !out.includes(part)) out.push(part);
    }
  }
  return out;
}

// Force a beat's params into a shape the chosen template can actually render:
// fill the fields that template reads (falling back to the covered script
// line), drop fields it ignores, and downgrade to motion_graphic when a
// template's must-have content (a quote, timeline items) is missing so a beat
// never renders blank. Brand color/font are stamped last, so the brand always
// wins regardless of what the model returned.
function coerceBeatParams(
  beatType: ClipBeatType,
  raw: unknown,
  scriptText: string,
  brand: ClipBrand,
  position: number,
): { beatType: ClipBeatType; params: ClipTemplateParams } {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const headline = str(r.headline) || scriptText.trim();
  const quote = str(r.quote) || scriptText.trim();
  const attribution = str(r.attribution);
  const subtext = str(r.subtext);

  let type: ClipBeatType = BEAT_TYPES.includes(beatType) ? beatType : 'motion_graphic';
  let params: ClipTemplateParams;

  switch (type) {
    case 'kinetic_quote_card':
      if (!quote) { type = 'motion_graphic'; params = { headline }; break; }
      params = { quote, highlight_words: validHighlights(quote, r.highlight_words) };
      if (attribution) params.attribution = attribution;
      break;
    case 'source_receipt_card':
      if (!quote) { type = 'motion_graphic'; params = { headline }; break; }
      params = { quote };
      if (headline) params.headline = headline;
      if (attribution) params.attribution = attribution;
      break;
    case 'timeline': {
      const items = Array.isArray(r.items)
        ? (r.items as unknown[]).map(it => {
            const o = (it && typeof it === 'object') ? it as Record<string, unknown> : {};
            const label = str(o.label);
            const sublabel = str(o.sublabel);
            return sublabel ? { label, sublabel } : { label };
          }).filter(it => it.label)
        : [];
      if (items.length < 2) { type = 'motion_graphic'; params = { headline }; break; }
      params = { headline, items: items.slice(0, 6) };
      break;
    }
    case 'ui_callout':
      params = subtext ? { headline, subtext } : { headline };
      break;
    case 'text_highlight':
      params = { headline, highlight_words: validHighlights(headline, r.highlight_words) };
      break;
    case 'animation':
      params = { headline };
      break;
    case 'motion_graphic':
    default:
      params = subtext ? { headline, subtext } : { headline };
      break;
  }

  const accent = brand.accents[position % brand.accents.length] || brand.accents[0];
  return { beatType: type, params: { ...params, accent, bg: brand.bg, font: brand.font } };
}

export async function generateBrollPlan(project: ClipProject, generation: ClipGeneration, geminiApiKey: string): Promise<ClipBrollBeat[]> {
  if (!geminiApiKey) throw new Error('Gemini API key missing — add it in Settings');
  const brand = await resolveClipBrand(project.branch);
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({
    model: SCRIPT_MODEL,
    contents: brollPrompt(project, generation, brand),
    // Some sampling variety so the treatments differ beat-to-beat, but lower
    // than the script call since structure matters more than surprise here.
    config: { responseMimeType: 'application/json', temperature: 0.8 },
  });
  const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let j: { beats?: Array<Record<string, unknown>> };
  try { j = JSON.parse(raw); } catch { throw new Error('The model returned an unreadable B-roll plan — try again'); }
  if (!Array.isArray(j.beats) || !j.beats.length) throw new Error('The model returned no beats — try again');

  const rows = j.beats.map((b, i) => {
    const position = typeof b.position === 'number' ? b.position : i;
    const rawType = BEAT_TYPES.includes(b.beat_type as ClipBeatType) ? b.beat_type as ClipBeatType : 'motion_graphic';
    // Fall back to the script line this beat covers when the model omits text.
    const scriptText = generation.script[position]?.text || String(b.headline || '');
    const { beatType, params } = coerceBeatParams(rawType, b.template_params, scriptText, brand, position);
    const tStart = Number(b.time_start) || 0;
    return {
      project_id: project.id,
      generation_id: generation.id,
      position,
      time_start: tStart,
      time_end: Number(b.time_end) || tStart + 6,
      beat_type: beatType,
      headline: String(b.headline || params.headline || ''),
      rationale: b.rationale ? String(b.rationale) : null,
      remotion_prompt: b.remotion_prompt ? String(b.remotion_prompt) : null,
      template_params: params,
      footage_prompts: Array.isArray(b.footage_prompts) ? b.footage_prompts.map(String) : [],
      triage: 'undecided' as ClipTriage,
    };
  });

  // Regenerating the plan replaces the old one (render jobs cascade away with their beats).
  await supabase.from('trellis_clip_broll_beats').delete().eq('project_id', project.id);
  const { data, error } = await supabase.from('trellis_clip_broll_beats').insert(rows).select('*');
  if (error || !data) throw new Error(`Could not save B-roll plan: ${error?.message}`);
  await setClipStatus(project.id, 'broll');
  return data as ClipBrollBeat[];
}

// ═══ Freeform: AI-designed scene cards ════════════════════════════════
// Instead of picking one of 7 fixed templates, the model designs each beat as
// a "scene" (background + positioned/animated text & shapes). coerceScene keeps
// it on-brand and safe; the worker's FreeformScene renders it.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The DSL vocabulary, shared by the plan prompt and the single-beat prompt.
function sceneDslBlock(brand: ClipBrand): string {
  return `CANVAS: 1080x1920 portrait. Positions/sizes are PERCENTAGES (0-100); x,y is an element's CENTER.

SCENE = { "background":{"type":"linear|radial|solid","colors":["#..","#.."],"angle":170}, "bokeh":true, "vignette":false, "elements":[ ... ] }
ELEMENT common: "type","x","y","w","h" (all %), "opacity"(0-1), "rotate"(deg), "enter":{"type":"...","delay":sec,"duration":sec}, "loop":"none|breathe|float|pulse"
- text: "text","size"(px @1080 width),"weight"(400-900),"color","align":"left|center|right","uppercase","italic","lineHeight","letterSpacing","highlight":["word"],"highlightColor"
- rect: "fill","stroke","strokeWidth","radius"(px),"glow"(hex)
- ellipse: "fill","glow","blur"
- line: "stroke","strokeWidth"
ENTER types: fade | slideUp | slideDown | slideLeft | slideRight | pop | growWidth | revealWords

BRAND — use ONLY this palette and dark look:
- Background base ${brand.bg} (very dark) — build backgrounds from it.
- Accent colors: ${brand.accents.join(', ')} — for highlights, rules, badges, glows.
- Text is near-white (#ffffff / warm off-white) on the dark background.

DESIGN RULES:
- Make each card's LAYOUT genuinely different — vary alignment, the hero element, and composition. Never repeat one recipe across beats.
- Visible text comes only from the script line (plus at most a short brand tag). No invented stats or labels.
- Legible: 1-2 text blocks per card, big type, generous spacing, 3-8 elements. Stagger enter delays so it animates in sequence.`;
}

function freeformPrompt(project: ClipProject, generation: ClipGeneration, brand: ClipBrand): string {
  return `You are an art director designing vertical motion-graphic cards for a YouTube Short${brand.name ? ` for ${brand.name}` : ''}. Design ONE distinct card per script beat.

${sceneDslBlock(brand)}

SCRIPT BEATS:
${JSON.stringify(generation.script.map((b, i) => ({ index: i, lane: b.lane, text: b.text })))}

Return ONLY raw JSON, no markdown fences: {"scenes":[ <one SCENE per beat, in order> ]}`;
}

function singleScenePrompt(project: ClipProject, beat: ClipBrollBeat, brand: ClipBrand): string {
  return `You are an art director refining ONE vertical motion-graphic card for a YouTube Short${brand.name ? ` for ${brand.name}` : ''}. Redesign it as a fresh scene.

${sceneDslBlock(brand)}

SCRIPT LINE this card covers: "${sanitizePII(beat.headline)}"
${beat.remotion_prompt ? `CREATOR DIRECTION (obey it): ${sanitizePII(beat.remotion_prompt)}` : ''}

Return ONLY raw JSON, no markdown fences: {"scene": <one SCENE> }`;
}

// Keep a scene on-brand and renderable: force the brand font, ensure an
// on-brand background and a non-empty set of valid elements. The renderer
// clamps every individual field, so this only guarantees the essentials.
function coerceScene(raw: unknown, brand: ClipBrand, scriptText: string): ClipScene {
  const s = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const bgIn = (s.background && typeof s.background === 'object') ? s.background as Record<string, unknown> : {};
  const bgCols = Array.isArray(bgIn.colors) ? (bgIn.colors as unknown[]).map(String).filter(c => HEX_RE.test(c)) : [];
  const background = {
    type: (['solid', 'linear', 'radial'].includes(bgIn.type as string) ? bgIn.type : 'linear') as 'solid' | 'linear' | 'radial',
    colors: bgCols.length ? bgCols.slice(0, 3) : [brand.bg, '#000000'],
    angle: typeof bgIn.angle === 'number' ? bgIn.angle : 170,
  };
  const valid = ['text', 'rect', 'ellipse', 'line'];
  let elements: SceneElement[] = Array.isArray(s.elements)
    ? (s.elements as unknown[]).filter((e): e is SceneElement => !!e && typeof e === 'object' && valid.includes((e as SceneElement).type)).slice(0, 14)
    : [];
  // Guarantee at least one legible line of the script text.
  if (!elements.some(e => e.type === 'text' && String(e.text || '').trim())) {
    elements = [...elements, {
      type: 'text', x: 50, y: 50, w: 82, text: scriptText, size: 72, weight: 800,
      color: '#ffffff', align: 'center', enter: { type: 'slideUp', duration: 0.6 },
    }];
  }
  return { background, bokeh: s.bokeh !== false, vignette: !!s.vignette, font: brand.font, elements };
}

async function generateScene(project: ClipProject, prompt: string, geminiApiKey: string, pick: (j: Record<string, unknown>) => unknown): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({
    model: SCRIPT_MODEL, contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.95 }, // high — we want design variety
  });
  const rawText = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let j: Record<string, unknown>;
  try { j = JSON.parse(rawText); } catch { throw new Error('The model returned an unreadable design — try again'); }
  return pick(j);
}

export async function generateFreeformPlan(project: ClipProject, generation: ClipGeneration, geminiApiKey: string): Promise<ClipBrollBeat[]> {
  if (!geminiApiKey) throw new Error('Gemini API key missing — add it in Settings');
  const brand = await resolveClipBrand(project.branch);
  const scenesRaw = await generateScene(project, freeformPrompt(project, generation, brand), geminiApiKey, j => j.scenes);
  const scenes = Array.isArray(scenesRaw) ? scenesRaw : [];
  if (!scenes.length) throw new Error('The model returned no scenes — try again');

  const rows = generation.script.map((b, i) => {
    const scene = coerceScene(scenes[i], brand, b.text);
    const tStart = i * 6;
    return {
      project_id: project.id,
      generation_id: generation.id,
      position: i,
      time_start: tStart,
      time_end: tStart + 6,
      beat_type: 'freeform' as ClipBeatType,
      headline: b.text.slice(0, 300),
      rationale: null,
      remotion_prompt: null,
      template_params: { scene } as ClipTemplateParams,
      footage_prompts: [] as string[],
      triage: 'undecided' as ClipTriage,
    };
  });

  await supabase.from('trellis_clip_broll_beats').delete().eq('project_id', project.id);
  const { data, error } = await supabase.from('trellis_clip_broll_beats').insert(rows).select('*');
  if (error || !data) throw new Error(`Could not save the design plan: ${error?.message}`);
  await setClipStatus(project.id, 'broll');
  return data as ClipBrollBeat[];
}

// ─── Per-beat regenerate ────────────────────────────────────────────
// Re-derive ONE beat's template_params from its covered script line plus the
// creator's edited direction, keeping the beat's template. This is what makes
// the "Remotion direction" field do real work: editing it and regenerating
// actually changes what renders, instead of the direction being a dead note.

// What each template renders and the exact params it reads — used to scope the
// prompt to a single beat type instead of listing all seven.
const BEAT_SPEC: Record<Exclude<ClipBeatType, 'freeform'>, { renders: string; fields: string; shape: string }> = {
  motion_graphic: { renders: 'a breathing orb over one short phrase', fields: 'headline (a short phrase from the line), subtext (optional secondary line)', shape: '{"headline":"...","subtext":"..."}' },
  kinetic_quote_card: { renders: 'a verbatim quote with a cascading word reveal', fields: 'quote (the exact quote text), highlight_words (2-4 words copied verbatim from the quote to emphasize), attribution (speaker/org, optional)', shape: '{"quote":"...","highlight_words":["..."],"attribution":"..."}' },
  animation: { renders: 'layered shapes under a device outline, with a caption', fields: 'headline (the caption)', shape: '{"headline":"..."}' },
  ui_callout: { renders: 'a phone notification mock', fields: 'headline (the message text), subtext (sender/app label, optional)', shape: '{"headline":"...","subtext":"..."}' },
  timeline: { renders: 'a horizontal progression of steps or eras', fields: 'headline (the title), items (3-6 of {label, sublabel})', shape: '{"headline":"...","items":[{"label":"...","sublabel":"..."}]}' },
  source_receipt_card: { renders: 'a document-style receipt proving a claim', fields: 'headline (the claim, optional), quote (the verbatim source line), attribution (the source name)', shape: '{"headline":"...","quote":"...","attribution":"..."}' },
  text_highlight: { renders: 'a sentence with key words highlighted', fields: 'headline (the sentence), highlight_words (2-4 words copied verbatim from the sentence)', shape: '{"headline":"...","highlight_words":["..."]}' },
};

function singleBeatPrompt(project: ClipProject, beat: ClipBrollBeat, brand: ClipBrand): string {
  const spec = BEAT_SPEC[beat.beat_type as Exclude<ClipBeatType, 'freeform'>];
  return `You are refining ONE B-roll beat for a vertical (1080x1920) YouTube Short${brand.name ? ` for ${brand.name}` : ''}.
Keep the beat type "${beat.beat_type}" — it renders ${spec.renders}. Do NOT switch to another treatment.

SCRIPT LINE this beat covers: "${sanitizePII(beat.headline)}"
${beat.remotion_prompt ? `CREATOR DIRECTION (obey it): ${sanitizePII(beat.remotion_prompt)}` : ''}

RULES:
- Fill ONLY these fields: ${spec.fields}.
- Visible text must come from the script line — no invented labels, stats, or captions.
- Do not set colors or fonts; the brand's are applied automatically.

Return ONLY raw JSON, no markdown fences:
{"template_params":${spec.shape}}`;
}

/**
 * Regenerate a single beat's params from its edited direction, keeping its
 * template. Persists the new template_params (and beat_type, in the rare case
 * the model can't fill the template and it safely downgrades). The creator's
 * remotion_prompt text is left untouched — it is the instruction, not output.
 */
export async function regenerateBeat(project: ClipProject, beat: ClipBrollBeat, geminiApiKey: string): Promise<ClipBrollBeat> {
  if (!geminiApiKey) throw new Error('Gemini API key missing — add it in Settings');
  const brand = await resolveClipBrand(project.branch);

  // Freeform beats re-derive a whole scene from the script line + direction.
  if (beat.beat_type === 'freeform') {
    const sceneRaw = await generateScene(project, singleScenePrompt(project, beat, brand), geminiApiKey, j => j.scene);
    const scene = coerceScene(sceneRaw, brand, beat.headline);
    const params = { scene } as ClipTemplateParams;
    const { error } = await supabase.from('trellis_clip_broll_beats')
      .update({ template_params: params, triage: 'undecided', updated_at: new Date().toISOString() })
      .eq('id', beat.id);
    if (error) throw new Error(`Could not save beat: ${error.message}`);
    return { ...beat, template_params: params, triage: 'undecided' };
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({
    model: SCRIPT_MODEL,
    contents: singleBeatPrompt(project, beat, brand),
    config: { responseMimeType: 'application/json', temperature: 0.85 },
  });
  const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let j: { template_params?: unknown };
  try { j = JSON.parse(raw); } catch { throw new Error('The model returned an unreadable beat — try again'); }
  // Accept either {template_params:{...}} or a bare params object.
  const rawParams = (j.template_params && typeof j.template_params === 'object') ? j.template_params : j;
  const { beatType, params } = coerceBeatParams(beat.beat_type, rawParams, beat.headline, brand, beat.position);

  const { error } = await supabase.from('trellis_clip_broll_beats')
    .update({ beat_type: beatType, template_params: params, triage: 'undecided', updated_at: new Date().toISOString() })
    .eq('id', beat.id);
  if (error) throw new Error(`Could not save beat: ${error.message}`);
  return { ...beat, beat_type: beatType, template_params: params, triage: 'undecided' };
}

// ═══ Phase C3: render queue (consumed by workers/clip-render-worker) ═

export async function getRenderJobs(projectId: string): Promise<ClipRenderJob[]> {
  const { data, error } = await supabase.from('trellis_clip_render_jobs').select('*')
    .eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load render jobs: ${error.message}`);
  return (data as ClipRenderJob[]) ?? [];
}

export async function queueBeatRender(beat: ClipBrollBeat): Promise<ClipRenderJob> {
  const { data, error } = await supabase.from('trellis_clip_render_jobs').insert({
    project_id: beat.project_id, beat_id: beat.id, job_type: 'beat', status: 'queued',
  }).select('*').single();
  if (error || !data) throw new Error(`Could not queue render: ${error?.message}`);
  return data as ClipRenderJob;
}

export async function queueAllRenders(beats: ClipBrollBeat[]): Promise<number> {
  const rows = beats.map(b => ({ project_id: b.project_id, beat_id: b.id, job_type: 'beat', status: 'queued' }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('trellis_clip_render_jobs').insert(rows);
  if (error) throw new Error(`Could not queue renders: ${error.message}`);
  return rows.length;
}

// ═══ Audio bed (Phase A: a music track under the stitched video) ══════
// Reuses the existing Lyria path (submitMusicJob → n8n → music_generations).
// The clip carries the direction and, once the job finishes, the track URL —
// which the assemble step muxes onto the silent B-roll.

export async function generateClipMusic(project: ClipProject, config: ClipAudioConfig, createdBy?: string | null): Promise<string> {
  const parts = [
    config.prompt?.trim(),
    project.hook_line ? `It scores a short about: ${project.hook_line}.` : '',
    `Background music bed for a ${project.target_seconds}-second vertical short — no abrupt ending.`,
  ].filter(Boolean);
  const { job_id } = await submitMusicJob({
    branch: project.branch || 'trellis',
    title: `Clip bed — ${project.title || 'untitled'}`.slice(0, 120),
    prompt: parts.join(' '),
    genre: config.genre,
    mood: config.mood,
    vocal_style: config.vocal_style,
    duration_seconds: project.target_seconds,
  }, createdBy);

  // Track the job and clear any prior resolved URL until the new one lands.
  await supabase.from('trellis_clip_projects').update({
    music_job_id: job_id, audio_config: config, audio_url: null,
    updated_at: new Date().toISOString(),
  }).eq('id', project.id);
  return job_id;
}

// Poll the backing music job; when it completes, persist the track URL onto the
// clip so assembly can mux it. Returns the current job (or null if none).
export async function pollClipMusic(project: ClipProject): Promise<MusicGeneration | null> {
  if (!project.music_job_id) return null;
  const job = await pollMusicJob(project.music_job_id);
  if (job?.status === 'completed' && job.audio_url && job.audio_url !== project.audio_url) {
    await supabase.from('trellis_clip_projects').update({
      audio_url: job.audio_url, updated_at: new Date().toISOString(),
    }).eq('id', project.id);
  }
  return job;
}

export async function clearClipMusic(project: ClipProject): Promise<void> {
  await supabase.from('trellis_clip_projects').update({
    music_job_id: null, audio_url: null, audio_config: null,
    updated_at: new Date().toISOString(),
  }).eq('id', project.id);
}

// ═══ Phase C4: assembly + publish ═════════════════════════════════════

export async function queueAssemble(project: ClipProject, clipUrls: string[]): Promise<ClipRenderJob> {
  if (clipUrls.length < 1) throw new Error('No rendered clips to assemble');
  const { data, error } = await supabase.from('trellis_clip_render_jobs').insert({
    project_id: project.id, beat_id: null, job_type: 'assemble', status: 'queued',
    // audio_url (when set) tells the worker to mux the music bed instead of
    // stitching silently.
    payload: { clip_urls: clipUrls, audio_url: project.audio_url ?? null },
  }).select('*').single();
  if (error || !data) throw new Error(`Could not queue assembly: ${error?.message}`);
  return data as ClipRenderJob;
}

export async function getClipPublications(projectId: string): Promise<ClipPublication[]> {
  const { data, error } = await supabase.from('trellis_clip_publications').select('*')
    .eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load publications: ${error.message}`);
  return (data as ClipPublication[]) ?? [];
}

export async function generateClipMetadata(project: ClipProject, generation: ClipGeneration | null, geminiApiKey: string): Promise<{ title: string; description: string; tags: string[]; hashtags: string[] }> {
  const fallback = {
    title: project.title.slice(0, 95),
    description: [project.hook_line, '#Shorts'].filter(Boolean).join('\n\n'),
    tags: [] as string[],
    hashtags: ['#Shorts'],
  };
  if (!geminiApiKey) return fallback;
  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const prompt = `Write YouTube Shorts publishing metadata for a short titled "${project.title}". Hook: "${project.hook_line || ''}". Script summary: ${generation ? generation.script.map(b => b.text).join(' ').slice(0, 2000) : 'n/a'}.
Return ONLY raw JSON, no markdown:
{"title":"punchy title under 90 chars","description":"2-4 sentence description ending with a follow CTA","tags":["10-15 search tags"],"hashtags":["#Shorts plus 3-5 more"]}`;
    const resp = await ai.models.generateContent({ model: SCRIPT_MODEL, contents: prompt });
    const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const j = JSON.parse(raw);
    return {
      title: (j.title || fallback.title).slice(0, 95),
      description: j.description || fallback.description,
      tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
      hashtags: Array.isArray(j.hashtags) ? j.hashtags.map(String) : fallback.hashtags,
    };
  } catch { return fallback; }
}

export async function publishClip(
  project: ClipProject,
  videoUrl: string,
  metadata: { title: string; description: string; tags: string[]; hashtags: string[] },
): Promise<ClipPublication> {
  const { data: pub, error } = await supabase.from('trellis_clip_publications').insert({
    project_id: project.id, platform: 'youtube', status: 'pending',
  }).select('*').single();
  if (error || !pub) throw new Error(`Could not create publication: ${error?.message}`);

  fetch(CLIP_PUBLISH_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publication_id: pub.id, project_id: project.id, branch: project.branch,
      platform: 'youtube', video_url: videoUrl, metadata,
    }),
  }).catch(() => {});
  await setClipStatus(project.id, 'publishing');
  return pub as ClipPublication;
}

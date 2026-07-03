import { GoogleGenAI } from '@google/genai';
import {
  ClipProject, ClipSource, ClipGeneration, ClipScriptBeat, ClipProjectStatus,
  CreateClipConfig, ClipBrollBeat, ClipBeatType, ClipTriage, ClipRenderJob,
  ClipPublication, ClipTemplateParams,
} from '../types';
import { CLIP_PUBLISH_WEBHOOK } from '../constants';
import { supabase } from '../lib/supabase';
import { sanitizePII } from './aiService';

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

function buildPrompt(project: ClipProject, sources: ClipSource[], feedback?: string, prior?: ClipGeneration): string {
  const srcBlock = sources.map(s =>
    `--- SOURCE ${s.label} (${s.kind}${s.filename ? `: ${s.filename}` : s.url ? `: ${s.url}` : ''}) ---\n${sanitizePII((s.raw_text || '').slice(0, SOURCE_CHAR_CAP))}`
  ).join('\n\n');

  const fmt = project.format?.kinds || [];
  const formatLines = [
    fmt.includes('interview') ? '- Interview format: interleave the creator\'s A-roll lines with VERBATIM quotes (SOT) from the source speakers. Never paraphrase inside a SOT beat.' : '',
    fmt.includes('promotion') ? `- Promotion format: naturally weave in the sponsor "${project.format?.sponsor || ''}". Talking points: ${project.format?.talking_points || 'n/a'}. Keep it one short, honest beat — not an ad read.` : '',
  ].filter(Boolean).join('\n');

  const revision = feedback && prior ? `
THIS IS A REVISION. The previous script (v${prior.version}) is below. Apply the creator's feedback while keeping the formula, hook strength, and target length intact.
CREATOR FEEDBACK: ${sanitizePII(feedback)}
PREVIOUS SCRIPT: ${JSON.stringify(prior.script)}
` : '';

  return `You are a short-form video script editor for a creator. Turn the source material into an "Interview Cut Sheet" for a vertical video (YouTube Short).

TARGET: ~${project.target_seconds} seconds spoken (~${Math.round(project.target_seconds * WORDS_PER_SECOND)} words total across all beats).
${project.steering ? `ANGLE / STEERING: ${sanitizePII(project.steering)}` : ''}
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

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({ model: SCRIPT_MODEL, contents: buildPrompt(project, sources, feedback, prior) });
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

function brollPrompt(project: ClipProject, generation: ClipGeneration): string {
  return `You are a motion-design director planning B-roll for a vertical (1080x1920) YouTube Short. For each script beat below, design ONE B-roll visual rendered by a fixed library of Remotion templates.

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
- SOT script beats (verbatim quotes) usually want kinetic_quote_card or source_receipt_card.
- Colors: dark editorial backgrounds (#080D12, #0A0E27, #1a1033 range), one vivid accent per beat (#22d3ee, #34d399, #f59e0b, #a78bfa range). Vary across beats.
- remotion_prompt: 2-4 sentence human-readable direction describing composition, motion and timing (like a brief to a motion designer).
- footage_prompts: 1-2 prompts for REAL footage (Seedance/Veo lane) only where motion graphics can't fake it (real places, hands, products, reactions); else [].
- Visible text only from the script — no invented labels, stats or captions.

SCRIPT BEATS:
${JSON.stringify(generation.script.map((b, i) => ({ index: i, lane: b.lane, speaker: b.speaker, text: b.text })))}

Return ONLY raw JSON, no markdown fences:
{"beats":[{"position":0,"time_start":0,"time_end":6,"beat_type":"motion_graphic","headline":"exact script phrase this covers","rationale":"why this treatment","remotion_prompt":"...","template_params":{"headline":"...","accent":"#22d3ee","bg":"#080D12"},"footage_prompts":["..."]}]}`;
}

export async function generateBrollPlan(project: ClipProject, generation: ClipGeneration, geminiApiKey: string): Promise<ClipBrollBeat[]> {
  if (!geminiApiKey) throw new Error('Gemini API key missing — add it in Settings');
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const resp = await ai.models.generateContent({ model: SCRIPT_MODEL, contents: brollPrompt(project, generation) });
  const raw = (resp.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let j: { beats?: Array<Record<string, unknown>> };
  try { j = JSON.parse(raw); } catch { throw new Error('The model returned an unreadable B-roll plan — try again'); }
  if (!Array.isArray(j.beats) || !j.beats.length) throw new Error('The model returned no beats — try again');

  const rows = j.beats.map((b, i) => ({
    project_id: project.id,
    generation_id: generation.id,
    position: typeof b.position === 'number' ? b.position : i,
    time_start: Number(b.time_start) || 0,
    time_end: Number(b.time_end) || (Number(b.time_start) || 0) + 6,
    beat_type: BEAT_TYPES.includes(b.beat_type as ClipBeatType) ? b.beat_type as ClipBeatType : 'motion_graphic',
    headline: String(b.headline || ''),
    rationale: b.rationale ? String(b.rationale) : null,
    remotion_prompt: b.remotion_prompt ? String(b.remotion_prompt) : null,
    template_params: (b.template_params && typeof b.template_params === 'object') ? b.template_params as ClipTemplateParams : {},
    footage_prompts: Array.isArray(b.footage_prompts) ? b.footage_prompts.map(String) : [],
    triage: 'undecided' as ClipTriage,
  }));

  // Regenerating the plan replaces the old one (render jobs cascade away with their beats).
  await supabase.from('trellis_clip_broll_beats').delete().eq('project_id', project.id);
  const { data, error } = await supabase.from('trellis_clip_broll_beats').insert(rows).select('*');
  if (error || !data) throw new Error(`Could not save B-roll plan: ${error?.message}`);
  await setClipStatus(project.id, 'broll');
  return data as ClipBrollBeat[];
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

// ═══ Phase C4: assembly + publish ═════════════════════════════════════

export async function queueAssemble(project: ClipProject, clipUrls: string[]): Promise<ClipRenderJob> {
  if (clipUrls.length < 1) throw new Error('No rendered clips to assemble');
  const { data, error } = await supabase.from('trellis_clip_render_jobs').insert({
    project_id: project.id, beat_id: null, job_type: 'assemble', status: 'queued',
    payload: { clip_urls: clipUrls },
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

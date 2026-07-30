import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../lib/supabase';

// ─── Meta (Facebook/Instagram) Ads Manager export ─────────────────────
// This is a MANUAL export workflow: approved creative gets turned into
// copy + a CSV row the user pastes/imports into Ads Manager by hand.
// We deliberately do NOT call the Marketing API — that requires Meta App
// Review, and we're not blocking shipping this on that approval process.
// ────────────────────────────────────────────────────────────────────

// Meta's real Ads Manager CTA button enum (SCREAMING_SNAKE, as the API/CSV
// import expects it). Not exhaustive of every CTA Meta offers — this is the
// practical subset relevant to Sproutify's ecommerce/community offers.
export const META_CTA_OPTIONS: { value: string; label: string }[] = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BOOK_TRAVEL', label: 'Book Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'SEE_MENU', label: 'See Menu' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
];

const META_CTA_VALUES = new Set(META_CTA_OPTIONS.map(o => o.value));

// Meta Ads Manager truncates/hides copy past these lengths. Enforced both in
// the AI prompt and again in code after parsing, since the model won't always
// respect a stated limit.
export const META_LIMITS = {
  primary_text: 125,
  headline: 40,
  description: 30,
} as const;

export interface MetaAdCopy {
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  destination_url: string;
  ad_name: string;
}

// One row of a bulk-import-style CSV. Deliberately a distinct shape from
// MetaAdCopy — a CSV row carries campaign/ad-set naming plus the image
// filename, which aren't part of the ad copy itself.
export interface MetaAdExportRow {
  campaign_name: string;
  ad_set_name: string;
  ad_name: string;
  headline: string;
  primary_text: string;
  link_description: string;
  cta: string;
  destination_url: string;
  image_file_name: string;
}

// ─── Text limit helpers ────────────────────────────────────────────
// Truncate at a word boundary rather than mid-word — "20% off all micro"
// reads worse than "20% off all".
export function truncateAtWordBoundary(text: string, maxLen: number): string {
  const trimmed = (text || '').trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  const sliced = trimmed.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function fallbackCopy(opts: {
  brandName: string;
  offer?: string;
  existingHeadline?: string;
  headlineVariants?: string[];
  caption?: string;
}): MetaAdCopy {
  const headlineSource = opts.existingHeadline || opts.headlineVariants?.[0] || opts.brandName || 'Shop now';
  const primarySource = opts.offer || opts.caption || opts.existingHeadline || `Check out ${opts.brandName}.`;
  const descriptionSource = opts.caption || opts.offer || '';
  return {
    primary_text: truncateAtWordBoundary(primarySource, META_LIMITS.primary_text),
    headline: truncateAtWordBoundary(headlineSource, META_LIMITS.headline),
    description: truncateAtWordBoundary(descriptionSource, META_LIMITS.description),
    cta: 'LEARN_MORE',
    destination_url: '',
    ad_name: '',
  };
}

// ─── 1. generateMetaAdCopy ─────────────────────────────────────────
// Client-side Gemini call (same pattern as the rest of Creative Studio's
// script/caption generation). Ad copy is NOT the social caption — Meta ads
// need short, distinct fields with hard limits, so this is a dedicated
// direct-response-copywriter prompt, not a reuse of job.caption.
export async function generateMetaAdCopy(opts: {
  apiKey: string;
  brandName: string;
  tone?: string;
  offer?: string;
  existingHeadline?: string;
  headlineVariants?: string[];
  caption?: string;
  audience?: string;
}): Promise<MetaAdCopy> {
  if (!opts.apiKey) {
    // No key configured — never throw for a copy failure, just fall back.
    return fallbackCopy(opts);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey });

    const prompt = `You are a direct-response copywriter writing a Facebook/Instagram ad in Meta Ads Manager.

BRAND: ${opts.brandName}
TONE: ${opts.tone || 'friendly, confident'}
OFFER / MESSAGE: ${opts.offer || 'No specific offer given — write a general brand ad.'}
TARGET AUDIENCE: ${opts.audience || 'general audience'}
EXISTING HEADLINE (for reference, may reuse or improve): ${opts.existingHeadline || 'none'}
OTHER HEADLINE ANGLES TRIED: ${(opts.headlineVariants || []).join(' | ') || 'none'}
SOCIAL CAPTION (for context only — do NOT copy this verbatim, ad copy has different, stricter limits): ${opts.caption || 'none'}

Write four fields for the ad:
1. primary_text — the body copy shown above the image. HARD LIMIT: ${META_LIMITS.primary_text} characters, ideally less. This is what gets truncated behind "See more" — put the hook in the first sentence.
2. headline — the bold line shown under the image. HARD LIMIT: ${META_LIMITS.headline} characters. Punchy, benefit- or offer-led, not a full sentence.
3. description — optional supporting line, often hidden on some placements. HARD LIMIT: ${META_LIMITS.description} characters. Can be empty string if nothing useful to add.
4. cta — pick the single best-fit call-to-action from this exact list, return the value exactly as written: ${META_CTA_OPTIONS.map(o => o.value).join(', ')}.

Return strict JSON matching the schema. Every field must respect its character limit.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primary_text: { type: Type.STRING },
            headline: { type: Type.STRING },
            description: { type: Type.STRING },
            cta: { type: Type.STRING },
          },
          required: ['primary_text', 'headline', 'description', 'cta'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const cta = typeof parsed.cta === 'string' && META_CTA_VALUES.has(parsed.cta.trim().toUpperCase())
      ? parsed.cta.trim().toUpperCase()
      : 'LEARN_MORE';

    return {
      primary_text: truncateAtWordBoundary(String(parsed.primary_text || ''), META_LIMITS.primary_text) || fallbackCopy(opts).primary_text,
      headline: truncateAtWordBoundary(String(parsed.headline || ''), META_LIMITS.headline) || fallbackCopy(opts).headline,
      description: truncateAtWordBoundary(String(parsed.description || ''), META_LIMITS.description),
      cta,
      destination_url: '',
      ad_name: '',
    };
  } catch (err: any) {
    console.error('[adExportService] generateMetaAdCopy failed, using fallback:', err?.message || err);
    return fallbackCopy(opts);
  }
}

// ─── 2. buildAdsManagerCsv ─────────────────────────────────────────
// A Meta Ads Manager bulk-import-STYLE csv. NOTE: Meta periodically changes
// its exact bulk-import column names/order — verify this header set against
// the user's current Ads Manager > Bulk Create/Edit template before relying
// on a direct import. This is meant as a well-organized starting point for
// manual entry or a quick copy/paste, not a guaranteed drag-and-drop import.
const CSV_HEADERS = [
  'Campaign Name',
  'Ad Set Name',
  'Ad Name',
  'Title/Headline',
  'Body/Primary Text',
  'Link Description',
  'Call to Action',
  'Link',
  'Image File Name',
] as const;

// RFC4180: wrap in quotes and double any internal quotes whenever the field
// contains a comma, quote, or newline.
function csvEscape(value: string): string {
  const v = value ?? '';
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function buildAdsManagerCsv(rows: MetaAdExportRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push([
      row.campaign_name,
      row.ad_set_name,
      row.ad_name,
      row.headline,
      row.primary_text,
      row.link_description,
      row.cta,
      row.destination_url,
      row.image_file_name,
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

// ─── 3. saveAdExport ────────────────────────────────────────────────
// Persists the finalized copy to video_ad_jobs.ad_export (JSONB) on the Hub
// so a later performance import (spend/results pulled from Ads Manager) can
// be matched back to the source creative by ad_name.
export async function saveAdExport(jobId: string, copy: MetaAdCopy): Promise<void> {
  const { error } = await supabase
    .from('video_ad_jobs')
    .update({ ad_export: copy })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to save Meta ad export for job ${jobId}: ${error.message}`);
  }
}

// ─── 4. Download helpers ────────────────────────────────────────────
export function downloadTextFile(filename: string, contents: string, mime: string = 'text/plain'): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Fetches the image as a blob before triggering the download so the filename
// actually sticks (a plain <a download> on a cross-origin image URL often
// gets ignored by the browser and opens the image in a new tab instead).
export async function downloadImage(url: string, filename: string): Promise<void> {
  if (!url) throw new Error('No image URL to download.');
  let blob: Blob;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    blob = await response.blob();
  } catch (err: any) {
    throw new Error(`Failed to download image: ${err.message || 'Unknown error'}`);
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

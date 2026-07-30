import { supabase } from '../lib/supabase';
import { ParsedAdRow, MatchedAdRow, AdPerformanceRow, CreativeLeaderboardEntry } from '../types';

// ─── Ad Performance Service ─────────────────────────────────────────
// Manual Meta Ads Manager loop: the user runs ads by hand in Ads Manager
// (Marketing API needs App Review, which we're not blocking on), exports a
// results CSV, and this service ingests it, links each row back to the
// video_ad_jobs creative that produced the asset, and computes a per-creative
// leaderboard so "which creative patterns win" becomes answerable.
//
// `ad_performance` and `video_ad_jobs` both live on Hub Supabase.
// ────────────────────────────────────────────────────────────────────

// Below this many impressions, CTR/CPC swings are mostly noise — the
// leaderboard flags these creatives as "not enough data" rather than
// ranking them as winners or losers. Surfaced in the UI so the rule isn't hidden.
export const MIN_IMPRESSIONS_FOR_SIGNIFICANCE = 1000;

// ═══════════════════════════════════════════════════════════════
// 1. CSV PARSING (RFC4180-aware)
// ═══════════════════════════════════════════════════════════════

type CanonicalField =
  | 'campaign_name' | 'adset_name' | 'ad_name' | 'external_ad_id'
  | 'reporting_start' | 'reporting_end'
  | 'impressions' | 'reach' | 'clicks' | 'spend' | 'conversions' | 'conversion_value';

// Meta's export column names vary by account, locale, and report preset.
// Match case-insensitively against a normalized (lowercased, punctuation-stripped)
// header, so "Amount spent (USD)" and "amount spent" both resolve the same way.
const HEADER_VARIANTS: Record<CanonicalField, string[]> = {
  campaign_name: ['campaign name'],
  adset_name: ['ad set name', 'adset name'],
  ad_name: ['ad name'],
  external_ad_id: ['ad id', 'ad delivery id', 'ad ids'],
  reporting_start: ['reporting starts', 'reporting start', 'date start', 'start date'],
  reporting_end: ['reporting ends', 'reporting end', 'date stop', 'end date'],
  impressions: ['impressions'],
  reach: ['reach'],
  clicks: ['clicks all', 'link clicks', 'clicks'],
  spend: ['amount spent usd', 'amount spent', 'spend'],
  conversions: ['results', 'purchases', 'website purchases', 'conversions', 'result count'],
  conversion_value: [
    'purchases conversion value', 'website purchases conversion value',
    'conversion value', 'purchase conversion value',
  ],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matchCanonicalField(normalizedHeader: string): CanonicalField | null {
  for (const field of Object.keys(HEADER_VARIANTS) as CanonicalField[]) {
    if (HEADER_VARIANTS[field].includes(normalizedHeader)) return field;
  }
  return null;
}

function parseNumber(v?: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  const trimmed = v.trim();
  if (trimmed === '' || trimmed === '--' || trimmed.toLowerCase() === 'n/a') return undefined;
  const cleaned = trimmed.replace(/[$,%]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parseDate(v?: string): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const isoMatch = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

// Hand-rolled RFC4180 parser (no dependency): handles quoted fields containing
// commas/newlines and doubled `""` escapes, plus \r\n or \n line endings.
function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyField = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; sawAnyField = true; continue; }
    if (char === ',') { row.push(field); field = ''; sawAnyField = true; continue; }
    if (char === '\r') { continue; }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAnyField = false;
      continue;
    }
    field += char;
    sawAnyField = true;
  }

  if (sawAnyField || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank rows (typically a trailing newline).
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * Parses a Meta Ads Manager results export (CSV text) into structured rows.
 * Never throws on a malformed line — per-row problems are collected into
 * `errors` and the offending row is skipped so the rest of the file still imports.
 */
export function parseAdsManagerCsv(text: string): { rows: ParsedAdRow[]; errors: string[] } {
  const errors: string[] = [];
  const table = parseCsvTable(text);

  if (table.length === 0) {
    return { rows: [], errors: ['The pasted/uploaded file has no rows.'] };
  }

  const headerRow = table[0];
  const headerCount = headerRow.length;
  const colIndex: Partial<Record<CanonicalField, number>> = {};
  headerRow.forEach((h, idx) => {
    const field = matchCanonicalField(normalizeHeader(h));
    if (field && colIndex[field] === undefined) colIndex[field] = idx;
  });

  if (Object.keys(colIndex).length === 0) {
    errors.push('No recognizable Ads Manager columns were found in the header row — is this a Meta Ads Manager export?');
  }

  const rows: ParsedAdRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const raw = table[r];
    const rowNumber = r + 1; // 1-based, header counted as line 1

    if (raw.length !== headerCount) {
      errors.push(`Row ${rowNumber}: expected ${headerCount} columns, found ${raw.length}. Row skipped.`);
      continue;
    }

    try {
      const get = (field: CanonicalField): string | undefined => {
        const idx = colIndex[field];
        return idx !== undefined ? raw[idx]?.trim() : undefined;
      };

      const mappedIndices = new Set(Object.values(colIndex));
      const unmapped: Record<string, string> = {};
      headerRow.forEach((h, idx) => {
        if (!mappedIndices.has(idx) && raw[idx] !== undefined && raw[idx] !== '') {
          unmapped[h] = raw[idx];
        }
      });

      const adName = get('ad_name');
      const externalId = get('external_ad_id');
      if (!adName && !externalId) {
        errors.push(`Row ${rowNumber}: no Ad name or Ad ID — this row will import as unidentified spend.`);
      }

      rows.push({
        row_number: rowNumber,
        campaign_name: get('campaign_name') || undefined,
        adset_name: get('adset_name') || undefined,
        ad_name: adName || undefined,
        external_ad_id: externalId || undefined,
        reporting_start: parseDate(get('reporting_start')),
        reporting_end: parseDate(get('reporting_end')),
        impressions: parseNumber(get('impressions')),
        reach: parseNumber(get('reach')),
        clicks: parseNumber(get('clicks')),
        spend: parseNumber(get('spend')),
        conversions: parseNumber(get('conversions')),
        conversion_value: parseNumber(get('conversion_value')),
        raw: unmapped,
      });
    } catch (e) {
      errors.push(`Row ${rowNumber}: ${e instanceof Error ? e.message : 'failed to parse this row'}.`);
    }
  }

  return { rows, errors };
}

// ═══════════════════════════════════════════════════════════════
// 2. CREATIVE MATCHING (ad_performance row ↔ video_ad_jobs)
// ═══════════════════════════════════════════════════════════════

// Local shape of the video_ad_jobs columns this service needs. Kept separate
// from the shared VideoAdJob type in types.ts (that file is append-only for
// this feature) — `ad_export` isn't modeled there yet.
export interface CreativeJobRecord {
  id: string;
  branch: string | null;
  format: string | null;
  frame_url: string | null;
  composite_url: string | null;
  media_urls: string[] | string | null;
  frame_prompt: string | null;
  script: string | null;
  caption: string | null;
  ad_export: Record<string, any> | string | null;
  created_at: string;
}

// n8n's Supabase node writes JSONB columns by stringifying them, so PostgREST
// sometimes stores/returns a JSON *string* instead of a native array/object
// (same gotcha documented in videoAdService.ts). Normalize defensively.
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function jobAdExport(job: CreativeJobRecord): Record<string, any> {
  return parseJsonbField<Record<string, any>>(job.ad_export, {});
}

function jobImageUrl(job: CreativeJobRecord): string | null {
  const mediaUrls = parseJsonbField<string[]>(job.media_urls, []);
  return job.composite_url || job.frame_url || mediaUrls[0] || null;
}

// job.script is a JSON string like {"headline":"...","subtext":"...","cta":"..."}
// (same convention as VideoAdLab's parseJobCopy). Falls back to caption, then null.
function jobHeadline(job: CreativeJobRecord): string | null {
  if (job.script) {
    try {
      const parsed = JSON.parse(job.script);
      if (parsed && typeof parsed === 'object' && typeof parsed.headline === 'string') {
        return parsed.headline;
      }
    } catch {
      // job.script isn't JSON — fall through.
    }
  }
  return job.caption || null;
}

// Case/whitespace/punctuation-insensitive comparison for the fallback match tier.
function normalizeAdName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Links each parsed CSV row to the video_ad_jobs creative that produced it.
 * Tries an exact match on job.ad_export.ad_name first, then falls back to a
 * normalized comparison. Rows that match nothing still come back with
 * creative_job_id: null and match_confidence: 'none' — they're real spend,
 * they just can't be attributed to a specific creative yet.
 */
export function matchRowsToJobs(rows: ParsedAdRow[], jobs: CreativeJobRecord[]): MatchedAdRow[] {
  const exactMap = new Map<string, CreativeJobRecord>();
  const normalizedMap = new Map<string, CreativeJobRecord>();

  for (const job of jobs) {
    const adName = jobAdExport(job).ad_name;
    const trimmedAdName = typeof adName === 'string' ? adName.trim() : '';
    if (!trimmedAdName) continue;
    if (!exactMap.has(trimmedAdName)) exactMap.set(trimmedAdName, job);
    const norm = normalizeAdName(trimmedAdName);
    if (norm && !normalizedMap.has(norm)) normalizedMap.set(norm, job);
  }

  return rows.map((row) => {
    const rowAdName = row.ad_name?.trim();
    let job: CreativeJobRecord | undefined;
    let confidence: MatchedAdRow['match_confidence'] = 'none';

    if (rowAdName) {
      job = exactMap.get(rowAdName);
      if (job) {
        confidence = 'exact';
      } else {
        const norm = normalizeAdName(rowAdName);
        job = norm ? normalizedMap.get(norm) : undefined;
        if (job) confidence = 'normalized';
      }
    }

    if (!job) {
      return { ...row, creative_job_id: null, match_confidence: 'none' };
    }

    return {
      ...row,
      creative_job_id: job.id,
      match_confidence: confidence,
      matched_ad_name: jobAdExport(job).ad_name || undefined,
      matched_branch: job.branch,
      matched_headline: jobHeadline(job),
      matched_image_url: jobImageUrl(job),
    };
  });
}

/** Fetches the video_ad_jobs rows needed for matching + the leaderboard join. */
export async function fetchCreativeJobsForMatching(): Promise<CreativeJobRecord[]> {
  const { data, error } = await supabase
    .from('video_ad_jobs')
    .select('id, branch, format, frame_url, composite_url, media_urls, frame_prompt, script, caption, ad_export, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch creative jobs: ${error.message}`);
  }

  return (data as CreativeJobRecord[]) ?? [];
}

// ═══════════════════════════════════════════════════════════════
// 3. IMPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Upserts matched rows into `ad_performance`, deduping on the partial unique
 * index (external_ad_id, reporting_start, reporting_end) where external_ad_id
 * is not null. Rows without an Ad ID can't be deduped by Postgres (Meta
 * exports normally include one), so those always insert as new rows.
 */
export async function importAdPerformance(rows: MatchedAdRow[]): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const toRecord = (r: MatchedAdRow) => ({
    creative_job_id: r.creative_job_id,
    branch: r.matched_branch ?? null,
    platform: 'meta',
    campaign_name: r.campaign_name ?? null,
    adset_name: r.adset_name ?? null,
    ad_name: r.ad_name ?? null,
    external_ad_id: r.external_ad_id ?? null,
    headline_used: r.matched_headline ?? null,
    reporting_start: r.reporting_start ?? null,
    reporting_end: r.reporting_end ?? null,
    impressions: r.impressions ?? 0,
    reach: r.reach ?? 0,
    clicks: r.clicks ?? 0,
    spend: r.spend ?? 0,
    conversions: r.conversions ?? 0,
    conversion_value: r.conversion_value ?? 0,
    raw: r.raw ?? {},
  });

  const withId = rows.filter(r => r.external_ad_id).map(toRecord);
  const withoutId = rows.filter(r => !r.external_ad_id).map(toRecord);

  let inserted = 0;

  if (withId.length > 0) {
    const { data, error } = await supabase
      .from('ad_performance')
      .upsert(withId, { onConflict: 'external_ad_id,reporting_start,reporting_end', ignoreDuplicates: true })
      .select('id');
    if (error) {
      throw new Error(`Failed to import ad performance rows: ${error.message}`);
    }
    inserted += data?.length ?? 0;
  }

  if (withoutId.length > 0) {
    const { data, error } = await supabase.from('ad_performance').insert(withoutId).select('id');
    if (error) {
      throw new Error(`Failed to import ad performance rows without an Ad ID: ${error.message}`);
    }
    inserted += data?.length ?? 0;
  }

  const skipped = rows.length - inserted;
  return { inserted, skipped: Math.max(0, skipped) };
}

// ═══════════════════════════════════════════════════════════════
// 4. READ / LEADERBOARD
// ═══════════════════════════════════════════════════════════════

export interface FetchAdPerformanceOptions {
  branch?: string;
  limit?: number;
}

export async function fetchAdPerformance(opts: FetchAdPerformanceOptions = {}): Promise<AdPerformanceRow[]> {
  let query = supabase.from('ad_performance').select('*').order('imported_at', { ascending: false });
  if (opts.branch) query = query.eq('branch', opts.branch);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch ad performance: ${error.message}`);
  }
  return (data as AdPerformanceRow[]) ?? [];
}

const sum = (rows: AdPerformanceRow[], pick: (r: AdPerformanceRow) => number | null | undefined): number =>
  rows.reduce((acc, r) => acc + (pick(r) || 0), 0);

/**
 * Joins `ad_performance` to `video_ad_jobs` client-side (this repo does
 * client-side joins elsewhere too — see Campaigns.tsx) and aggregates spend,
 * impressions, clicks, conversions per creative. Rows that never matched a
 * job are grouped by ad name instead, so unattributed spend is still visible.
 */
export async function fetchCreativeLeaderboard(): Promise<CreativeLeaderboardEntry[]> {
  const [perfRows, jobs] = await Promise.all([fetchAdPerformance(), fetchCreativeJobsForMatching()]);
  const jobsById = new Map(jobs.map(j => [j.id, j]));

  const groups = new Map<string, AdPerformanceRow[]>();
  for (const row of perfRows) {
    const key = row.creative_job_id
      ? `job:${row.creative_job_id}`
      : `unmatched:${row.ad_name || row.external_ad_id || row.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const entries: CreativeLeaderboardEntry[] = [];
  for (const [key, groupRows] of groups) {
    const creativeJobId = key.startsWith('job:') ? key.slice(4) : null;
    const job = creativeJobId ? jobsById.get(creativeJobId) : undefined;

    const impressions = sum(groupRows, r => r.impressions);
    const reach = sum(groupRows, r => r.reach);
    const clicks = sum(groupRows, r => r.clicks);
    const spend = sum(groupRows, r => r.spend);
    const conversions = sum(groupRows, r => r.conversions);
    const conversion_value = sum(groupRows, r => r.conversion_value);

    entries.push({
      creative_job_id: creativeJobId,
      ad_name: (job ? jobAdExport(job).ad_name : undefined) || groupRows[0]?.ad_name || 'Unlinked ad',
      branch: (job?.branch ?? groupRows[0]?.branch) || null,
      format: job?.format ?? null,
      image_url: job ? jobImageUrl(job) : null,
      frame_prompt: job?.frame_prompt ?? null,
      headline_used: (job ? jobHeadline(job) : null) ?? groupRows.find(r => r.headline_used)?.headline_used ?? null,
      row_count: groupRows.length,
      impressions,
      reach,
      clicks,
      spend,
      conversions,
      conversion_value,
      ctr: ctr(clicks, impressions),
      cpc: cpc(spend, clicks),
      cpm: cpm(spend, impressions),
      cost_per_conversion: costPerConversion(spend, conversions),
      roas: roas(conversion_value, spend),
      has_enough_data: impressions >= MIN_IMPRESSIONS_FOR_SIGNIFICANCE,
    });
  }

  return entries.sort((a, b) => b.spend - a.spend);
}

// ═══════════════════════════════════════════════════════════════
// 5. DERIVED METRICS — pure helpers, divide-by-zero-safe (null, not NaN/Infinity)
// ═══════════════════════════════════════════════════════════════

export function ctr(clicks: number, impressions: number): number | null {
  if (!impressions) return null;
  return (clicks / impressions) * 100;
}

export function cpc(spend: number, clicks: number): number | null {
  if (!clicks) return null;
  return spend / clicks;
}

export function cpm(spend: number, impressions: number): number | null {
  if (!impressions) return null;
  return (spend / impressions) * 1000;
}

export function costPerConversion(spend: number, conversions: number): number | null {
  if (!conversions) return null;
  return spend / conversions;
}

export function roas(conversionValue: number, spend: number): number | null {
  if (!spend) return null;
  return conversionValue / spend;
}

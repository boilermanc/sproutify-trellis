import { supabase } from '../lib/supabase';

// ─── Clip Studio brand resolution ───────────────────────────────────
// A clip project stores its branch as a slug. The `branches` table is the
// app's source of truth for per-brand theming (the same columns the global
// branch picker loads): colors, font, and voice fields. We resolve those
// into a small, render-ready shape so both the script prompt (voice) and
// the B-roll planner (colors/font) speak in the brand's identity instead of
// a generic house style. Everything has a safe fallback so a branch with
// missing fields still renders.
// ─────────────────────────────────────────────────────────────────────

export interface ClipBrand {
  slug: string | null;
  name: string | null;
  tagline: string | null;
  tone: string | null;
  cta: string | null;
  // Render-ready visual identity:
  bg: string;          // dark background base (brand-tinted near-black)
  accents: string[];   // ordered brand colors, cycled across beats for variety
  text: string;        // primary text color on the dark background
  font: string;        // CSS font-family stack
}

// The look every template falls back to when a branch has no palette — the
// original editorial cyan-on-near-black.
const DEFAULT_BRAND: ClipBrand = {
  slug: null, name: null, tagline: null, tone: null, cta: null,
  bg: '#080D12',
  accents: ['#22d3ee', '#34d399', '#f59e0b', '#a78bfa'],
  text: '#ffffff',
  font: `'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`,
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex?: string | null): { r: number; g: number; b: number } | null {
  if (!hex || !HEX.test(hex.trim())) return null;
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

// Mix `hex` toward `target` by t (0 = hex, 1 = target).
function mix(hex: string, target: string, t: number): string {
  const a = parseHex(hex), b = parseHex(target);
  if (!a || !b) return hex;
  return `#${toHex(a.r + (b.r - a.r) * t)}${toHex(a.g + (b.g - a.g) * t)}${toHex(a.b + (b.b - a.b) * t)}`;
}

// A near-black background carrying a hint of the brand's primary color, so
// each brand's clips read as its own without losing the dark editorial base.
function brandBackground(primary: string | null): string {
  const p = parseHex(primary || '');
  if (!p) return DEFAULT_BRAND.bg;
  return mix(primary as string, '#040609', 0.88); // ~12% brand tint over near-black
}

// Map a stored font family name to a full CSS stack. Everything resolves to a
// safe fallback; today all brands use Inter, but a brand that later sets a
// different family will flow through here.
function fontStack(family?: string | null): string {
  const f = (family || '').trim();
  if (!f || /inter/i.test(f)) return DEFAULT_BRAND.font;
  return `'${f}', 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
}

interface BranchRow {
  name?: string | null;
  tagline?: string | null;
  tone?: string | null;
  default_cta?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
}

function toBrand(slug: string, row: BranchRow): ClipBrand {
  // Lead with the distinctive primary, then the accent — deduped and
  // validated. secondary_color is typically a dark slate, so it's used only
  // to seed the background, never as an on-screen accent.
  const accents = [row.primary_color, row.accent_color]
    .map(c => (c || '').trim())
    .filter(c => HEX.test(c))
    .filter((c, i, arr) => arr.indexOf(c) === i);

  return {
    slug,
    name: row.name?.trim() || null,
    tagline: row.tagline?.trim() || null,
    tone: row.tone?.trim() || null,
    cta: row.default_cta?.trim() || null,
    bg: brandBackground(row.primary_color || row.secondary_color || null),
    accents: accents.length ? accents : DEFAULT_BRAND.accents,
    text: DEFAULT_BRAND.text,
    font: fontStack(row.font_family),
  };
}

/**
 * Resolve a branch slug to its render-ready brand identity. Never throws —
 * a missing branch, missing row, or query error yields the default look so
 * clip generation is never blocked on brand data.
 */
export async function resolveClipBrand(slug: string | null | undefined): Promise<ClipBrand> {
  if (!slug) return DEFAULT_BRAND;
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('name, tagline, tone, default_cta, primary_color, secondary_color, accent_color, font_family')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_BRAND, slug };
    return toBrand(slug, data as BranchRow);
  } catch {
    return { ...DEFAULT_BRAND, slug };
  }
}

export { DEFAULT_BRAND };

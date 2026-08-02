import { BrandCardStyle } from '../types';

// Per-brand card style — the layer that makes a shared template render as a
// specific brand rather than a recolored sibling.
//
// WHERE THIS LIVES: seeded in code for now, keyed by branch slug. The
// destination is Brand DNA (the `brand_identities` table already carries
// `color_palette` and `typography` jsonb columns), with an editor in the Brand
// DNA page. `getBrandCardStyle` is the single seam that later reads from the DB
// instead of this map — nothing else changes. The seed is deliberately the
// source of truth because a locked brand's whole point is that its style is the
// thing you verified, not a near-miss regenerated each time.
//
// Three orthogonal policies per brand (see types.ts): palette, typography,
// templates. A brand can mix them freely.

const DISPLAY_SERIF = 'Playfair Display';

export const BRAND_CARD_STYLES: Record<string, BrandCardStyle> = {
  // Rekkrd — locked / locked / restricted. Near-black, warm off-white, one
  // orange used sparingly, serif headlines over MONO labels. The palette hexes
  // are the exact set eyeballed and approved in the mockups. Restricted to the
  // templates whose accent placement stays controllable; conversation/list/
  // quote/verse are off (they'd spend orange across many elements, or don't fit
  // the brand). `surface` is carried for the eventual grid/stat tile treatment.
  rekkrd: {
    fontPairing: { display: DISPLAY_SERIF, label: 'JetBrains Mono' },
    palettePolicy: {
      mode: 'locked',
      bg1: '#14100c',
      bg2: '#1a1510',
      text: '#efe9e0',
      muted: '#9a8f80',
      accent: '#e8621a',
      surface: '#1e1811',
    },
    templatePolicy: { mode: 'restricted', allowed: ['statement', 'editorial', 'stat', 'grid'] },
  },

  // Rejoice — expressive / locked / open. Its voice and layout stay consistent
  // but color roams within a warm, hopeful family. Font pairing is set to the
  // CURRENT defaults (Playfair + Inter) on purpose: Piece 1 must not change
  // Rejoice's output at all — the passing test is that a Rejoice batch renders
  // identically after this commit while Rekkrd transforms. Give Rejoice its own
  // label face later if wanted; that's a seed change, not a code change.
  rejoice: {
    fontPairing: { display: DISPLAY_SERIF, label: 'Inter' },
    palettePolicy: {
      mode: 'expressive',
      guidance: 'Warm and hopeful with light backgrounds. Color may roam within a gentle, faith-forward family (soft violets, warm ambers, sage, cream) — never cold or clinical.',
    },
    templatePolicy: { mode: 'open' },
  },
};

// Returns the brand's card style, or undefined for brands not yet styled — in
// which case card generation behaves exactly as it did before this feature
// (default fonts, model-chosen palette, all templates). So ATL and Sweetwater
// are untouched until they're deliberately given a style.
export function getBrandCardStyle(slug?: string | null): BrandCardStyle | undefined {
  if (!slug) return undefined;
  return BRAND_CARD_STYLES[slug.trim().toLowerCase()];
}

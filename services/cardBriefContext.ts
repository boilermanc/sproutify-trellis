import type { BrandIdentity } from '../types';
import { getBrandCreativeDirections } from './brandCreativeDirections';

// Product-site facts checked 2026-11-06: https://www.rekkrd.com/#features
// Keep this small; omit pricing, speed promises and plan entitlements.
const REKKRD_FEATURES = [
  'Spins: log records played, view play counts and recent listening history.',
  'Collection valuation: view low, median and high Discogs market estimates.',
  'Stakkd: catalog audio equipment and document a hi-fi setup.',
  'Camera scanning: identify records from a cover photo or barcode.',
  'Wantlist: track records being hunted and set price alerts.',
  'Listening Room: queue albums from the collection and save listening sessions.',
  'Playlist Studio: build mood-based playlists from records already owned.',
];

export function cardBrandFacts(slug: string, identity: BrandIdentity | null): string[] {
  if (slug === 'rekkrd') return REKKRD_FEATURES;
  if (identity?.branch_id !== slug || identity.status !== 'active') return [];
  return [identity.mission, identity.site_preview_description, ...identity.marketing_hooks]
    .filter((text): text is string => typeof text === 'string' && !!text.trim())
    .map(text => text.trim().slice(0, 1500)).slice(0, 10);
}

export function cardBriefDirection(slug: string, directionId: string, fallback: string) {
  const directions = getBrandCreativeDirections(slug);
  if (directionId === 'features') return {
    situations: ['a customer using a documented feature or offering of this brand'],
    guidance: 'Feature spotlight. Each card must name a specific documented feature or offering and connect it to a practical customer use. Use only supplied brand facts; never invent capabilities.',
  };
  const selected = directionId === 'variety' ? directions : directions.filter(d => d.id === directionId);
  return {
    situations: selected.map(d => d.description),
    guidance: selected.length ? selected.map(d => `${d.label}: ${d.description}`).join('\n') : fallback,
  };
}

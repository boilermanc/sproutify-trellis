import { CardConceptWithRef } from './creativeDirectorService';

export type BrandCreativeChannel = 'instagram' | 'reddit';

export interface BrandCreativeDirection {
  id: string;
  branchSlug: string;
  label: string;
  description: string;
  photoBrief: string;
  styleNotes: string;
  safeOverlay: {
    heading: string;
    footer: string;
  };
}

const REKKRD_STYLE_NOTES = [
  'Premium editorial record-culture photography with cinematic contrast and subtle film grain.',
  'Use Rekkrd near-black, warm ivory, and restrained burnt-orange accents.',
  'Keep the subject weighted to the RIGHT side and the LEFT half calm and uncluttered for typography.',
  'No embedded words, logos, watermarks, recognizable album artwork, or third-party branding.',
  'Authentic and tactile rather than glossy generic technology advertising.',
].join(' ');

export const BRAND_CREATIVE_DIRECTIONS: BrandCreativeDirection[] = [
  {
    id: 'vinyl-ritual',
    branchSlug: 'rekkrd',
    label: 'Vinyl Ritual',
    description: 'A close, tactile moment of putting a record on a turntable.',
    photoBrief: 'Close-up of a record collector carefully lowering a vinyl record onto a beautiful turntable, fingertips and record texture visible, intimate evening listening ritual, warm practical light, deep shadows, subject on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'Keep Discogs. Try Rekkrd.', footer: 'Explore your collection another way' },
  },
  {
    id: 'listening-room',
    branchSlug: 'rekkrd',
    label: 'Listening Room',
    description: 'A collector enjoying music in a warm, design-led listening space.',
    photoBrief: 'Stylish record collector listening in a warm home listening room, shelves of vinyl softly out of focus, relaxed human moment, amber lamp light, premium editorial composition, person and shelves on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'Your collection. Your way.', footer: 'Meet Rekkrd' },
  },
  {
    id: 'collection-detail',
    branchSlug: 'rekkrd',
    label: 'Collection Detail',
    description: 'Hands browsing a record collection with texture and depth.',
    photoBrief: 'Hands browsing a carefully organized vinyl record crate, tactile paper sleeves with abstract unbranded artwork, shallow depth of field, rich wood and paper textures, cinematic side light, action concentrated on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'See your collection differently.', footer: 'Explore Rekkrd' },
  },
  {
    id: 'connected-collection',
    branchSlug: 'rekkrd',
    label: 'Connected Collection',
    description: 'A stylized still life expressing one collection working across two tools.',
    photoBrief: 'Conceptual overhead still life of a vinyl record collection arranged in two connected zones, one shared record visually bridging them, subtle orange line motif suggesting two-way movement, dark premium surface, no interface screens or logos, composition weighted right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'One collection. Two-way sync.', footer: 'See how Rekkrd works with Discogs' },
  },
];

export function getBrandCreativeDirections(branchSlug?: string | null): BrandCreativeDirection[] {
  const slug = (branchSlug || '').trim().toLowerCase();
  return BRAND_CREATIVE_DIRECTIONS.filter(direction => direction.branchSlug === slug);
}

export function getBrandCreativeDirection(branchSlug: string, directionId?: string | null): BrandCreativeDirection | undefined {
  const directions = getBrandCreativeDirections(branchSlug);
  return directions.find(direction => direction.id === directionId) || directions[0];
}

export function getBrandCreativeDirectionForIndex(branchSlug: string, index: number): BrandCreativeDirection | undefined {
  const directions = getBrandCreativeDirections(branchSlug);
  if (directions.length === 0) return undefined;
  return directions[Math.max(0, index) % directions.length];
}

export function buildCreativeDirectionBrief(
  direction: BrandCreativeDirection,
  channel: BrandCreativeChannel,
  sourceBrief: string,
): string {
  return [
    sourceBrief.trim(),
    `SHARED BRAND CREATIVE DIRECTION — ${direction.label}: ${direction.description}`,
    `Background scene: ${direction.photoBrief}`,
    `Visual rules: ${direction.styleNotes}`,
    `Approved overlay headline: ${direction.safeOverlay.heading}`,
    `Approved overlay footer: ${direction.safeOverlay.footer}`,
    channel === 'reddit'
      ? 'This is paid Reddit creative. Keep the artwork sparse because Reddit supplies the promoted headline and CTA outside the image.'
      : 'This is an Instagram feed creative. Let the caption carry detail; keep the image message short and visually led.',
    'Do not add product claims, speed claims, guarantees, prices, testimonials, statistics, or offers beyond the approved overlay copy.',
  ].join('\n\n');
}

export function applyBrandCreativeDirection(
  concept: CardConceptWithRef,
  direction: BrandCreativeDirection,
): CardConceptWithRef {
  return {
    ...concept,
    template: 'editorial',
    creativeDirectionId: direction.id,
    wordmark: 'Rekkrd',
    wordmarkSubtitle: 'Collection Management',
    heading: direction.safeOverlay.heading,
    bullets: [],
    footer: direction.safeOverlay.footer,
    photo_brief: direction.photoBrief,
    backgroundUrl: undefined,
    scrimStrength: 0.58,
    rationale: `${direction.label}: ${direction.description}`,
  };
}

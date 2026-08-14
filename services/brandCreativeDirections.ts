import { CardConceptWithRef } from './creativeDirectorService';

export type BrandCreativeChannel = 'instagram' | 'reddit';

export interface BrandCreativeDirection {
  id: string;
  branchSlug: string;
  label: string;
  description: string;
  wordmark: string;
  wordmarkSubtitle: string;
  photoBrief: string;
  styleNotes: string;
  scrimStrength?: number;
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

const REJOICE_STYLE_NOTES = [
  'Warm, hopeful editorial lifestyle photography with natural light and gentle human emotion.',
  'Use a light, welcoming family of cream, soft violet, warm amber, and sage rather than dark crisis imagery.',
  'Keep the subject weighted to the RIGHT side and the LEFT half calm and uncluttered for typography.',
  'Show everyday life with dignity and emotional range; Rejoice is for joy, curiosity, wisdom, growth, peace, and hard days.',
  // Rejoice is a phone app, so a phone belongs in these scenes — but an image
  // model asked for a phone screen invents a garbled fake interface with
  // nonsense text, which on a Bible-study brand reads as fabricated scripture.
  // Same reason the existing rule keeps printed Bible text illegible: the
  // object may appear, its content may not.
  'A smartphone may appear naturally in the scene, but its screen must always be dark, switched off, or a soft reflection — never show a visible interface, app, icons, buttons, or any legible text on a screen.',
  'A Bible or notebook may appear, but printed and handwritten words must stay soft and illegible.',
  'No embedded words, logos, watermarks, fabricated scripture, visible Bible text, or exaggerated spiritual transformation.',
  'Avoid defaulting to sadness, bowed heads, tears, loneliness, or gloomy blue lighting.',
].join(' ');

export const BRAND_CREATIVE_DIRECTIONS: BrandCreativeDirection[] = [
  {
    id: 'vinyl-ritual',
    branchSlug: 'rekkrd',
    label: 'Vinyl Ritual',
    description: 'A close, tactile moment of putting a record on a turntable.',
    wordmark: 'Rekkrd',
    wordmarkSubtitle: 'Collection Management',
    photoBrief: 'Close-up of a record collector carefully lowering a vinyl record onto a beautiful turntable, fingertips and record texture visible, intimate evening listening ritual, warm practical light, deep shadows, subject on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'Keep Discogs. Try Rekkrd.', footer: 'Explore your collection another way' },
  },
  {
    id: 'listening-room',
    branchSlug: 'rekkrd',
    label: 'Listening Room',
    description: 'A collector enjoying music in a warm, design-led listening space.',
    wordmark: 'Rekkrd',
    wordmarkSubtitle: 'Collection Management',
    photoBrief: 'Stylish record collector listening in a warm home listening room, shelves of vinyl softly out of focus, relaxed human moment, amber lamp light, premium editorial composition, person and shelves on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'Your collection. Your way.', footer: 'Meet Rekkrd' },
  },
  {
    id: 'collection-detail',
    branchSlug: 'rekkrd',
    label: 'Collection Detail',
    description: 'Hands browsing a record collection with texture and depth.',
    wordmark: 'Rekkrd',
    wordmarkSubtitle: 'Collection Management',
    photoBrief: 'Hands browsing a carefully organized vinyl record crate, tactile paper sleeves with abstract unbranded artwork, shallow depth of field, rich wood and paper textures, cinematic side light, action concentrated on the right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'See your collection differently.', footer: 'Explore Rekkrd' },
  },
  {
    id: 'connected-collection',
    branchSlug: 'rekkrd',
    label: 'Connected Collection',
    description: 'A stylized still life expressing one collection working across two tools.',
    wordmark: 'Rekkrd',
    wordmarkSubtitle: 'Collection Management',
    photoBrief: 'Conceptual overhead still life of a vinyl record collection arranged in two connected zones, one shared record visually bridging them, subtle orange line motif suggesting two-way movement, dark premium surface, no interface screens or logos, composition weighted right.',
    styleNotes: REKKRD_STYLE_NOTES,
    safeOverlay: { heading: 'One collection. Two-way sync.', footer: 'See how Rekkrd works with Discogs' },
  },
  {
    id: 'joy-worth-noticing',
    branchSlug: 'rejoice',
    label: 'Joy Worth Noticing',
    description: 'Celebration, gratitude, music, friendship, and ordinary moments of delight.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'A genuinely joyful everyday moment among friends in warm late-afternoon sunlight, one of them holding a phone they have just shown the others with the dark screen angled away from camera, relaxed laughter and connection, candid rather than posed, people grouped on the right with calm negative space on the left.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.42,
    safeOverlay: { heading: 'Make room for joy.', footer: 'Explore joy in scripture' },
  },
  {
    id: 'curious-about-scripture',
    branchSlug: 'rejoice',
    label: 'Curious About Scripture',
    description: 'Questions, discovery, learning, and the pleasure of going deeper.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'An inviting study table with an open Bible whose printed words are not legible, an open notebook with blank-looking pages, a pen, warm tea, and a phone propped against a small stack of books with its screen dark, soft morning window light, thoughtful person studying on the right, curious and energized rather than solemn.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.46,
    safeOverlay: { heading: 'Bring your questions.', footer: 'Explore scripture with Rejoice' },
  },
  {
    id: 'everyday-wisdom',
    branchSlug: 'rejoice',
    label: 'Everyday Wisdom',
    description: 'Faith applied to relationships, work, choices, patience, and ordinary life.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'A calm kitchen-table reflection in an active, lived-in home, a person pausing with an open journal and pen before beginning the day, a phone resting face-up beside it with a dark screen, warm natural light, subtle signs of ordinary responsibilities, grounded and practical, person on the right.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.44,
    safeOverlay: { heading: 'Faith for ordinary days.', footer: 'Study. Reflect. Grow.' },
  },
  {
    id: 'growing-in-faith',
    branchSlug: 'rejoice',
    label: 'Growing in Faith',
    description: 'Habits, deeper study, reflection, purpose, and steady spiritual growth.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'A hopeful morning pause on a bench along a sunlit garden path, a person seated on the right with a phone held loosely in one hand, screen dark, a small pocket notebook beside them, fresh green growth, warm light, peaceful forward-looking energy without dramatic transformation imagery.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.4,
    safeOverlay: { heading: 'Keep growing.', footer: 'Start where you are' },
  },
  {
    id: 'peace-for-today',
    branchSlug: 'rejoice',
    label: 'Peace for Today',
    description: 'Rest, presence, breathing room, and reflection without implying crisis.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'A peaceful light-filled reading corner in late morning, a comfortable chair, soft blanket, plant, tea, an open book with no legible text, and a phone and small notebook resting on the arm of the chair with the phone screen dark, calm but not lonely, warm cream and sage palette, visual interest on the right.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.4,
    safeOverlay: { heading: 'A quiet place to begin.', footer: 'Open Rejoice' },
  },
  {
    id: 'when-life-feels-heavy',
    branchSlug: 'rejoice',
    label: 'When Life Feels Heavy',
    description: 'Gentle support for difficult moments, included as one part of a much wider emotional range.',
    wordmark: 'Rejoice',
    wordmarkSubtitle: 'Bible Study for How You Feel',
    photoBrief: 'A compassionate everyday scene of one friend quietly present with another, a phone set face-down on the table between them, warm lamplight, supportive body language, dignity and connection, no tears or melodrama, people on the right with hopeful warm light entering the space.',
    styleNotes: REJOICE_STYLE_NOTES,
    scrimStrength: 0.48,
    safeOverlay: { heading: "You don't have to have the words.", footer: 'Start with how you feel' },
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
    // `direction.safeOverlay` is DELIBERATELY not sent to the model, in any
    // framing. It was first sent as "approved overlay" copy (stamped on
    // verbatim), then softened to a "tone reference — do not reuse these
    // lines" — and the model reused them anyway, putting "Make room for joy."
    // back on a card whose brief was about something else entirely. A line the
    // model can see is a line it can copy, and copying is exactly the failure
    // being designed out. The presets survive only as the code-level fallback
    // in `applyBrandCreativeDirection`, where nothing can echo them.
    `Register: ${direction.description} Match that feeling — the words themselves must come from the marketer's brief above.`,
    'Write the headline (the "statement" field) and the footer for this concept from the brief. The footer is tracked caps on one line — keep it to about 6 words or 40 characters. Every concept in the batch needs its own distinct headline.',
    channel === 'reddit'
      ? 'This is paid Reddit creative. Keep the artwork sparse because Reddit supplies the promoted headline and CTA outside the image.'
      : 'This is an Instagram feed creative. Let the caption carry detail; keep the image message short and visually led.',
    'Do not add product claims, speed claims, guarantees, prices, testimonials, statistics, or offers beyond the approved overlay copy.',
  ].join('\n\n');
}

// The footer is drawn as ONE un-shrunk tracked-caps line (see `drawEditorial`
// — unlike the headline, it has no auto-fit), so a long one runs off the right
// edge instead of wrapping. Roughly the widest that fits at the footer's fixed
// size; anything longer falls back to the direction's own short line.
const MAX_FOOTER_CHARS = 44;

/**
 * Stamps a direction's VISUAL identity onto a generated concept — layout,
 * wordmark, photo brief, scrim — while leaving the COPY the director wrote in
 * place.
 *
 * The overlay copy used to be overwritten with `direction.safeOverlay` too,
 * which meant every card in a batch could only ever say one of a handful of
 * hardcoded lines ("Make room for joy.", "Bring your questions.") no matter
 * what the brief asked for: the brief was generated against and then thrown
 * away. The presets are now the FALLBACK, used when the director didn't write
 * usable copy — not the override. Everything visual is still fixed, so a
 * direction still renders as the same designed card; only the words change.
 */
export function applyBrandCreativeDirection(
  concept: CardConceptWithRef,
  direction: BrandCreativeDirection,
): CardConceptWithRef {
  const generatedHeading = (concept.heading || concept.statement || '').trim();
  const generatedFooter = (concept.footer || '').trim();
  const usedStockHeading = !generatedHeading;
  const usedStockFooter = !generatedFooter || generatedFooter.length > MAX_FOOTER_CHARS;

  // Say so on the card when the stock copy had to be used. A silent fallback
  // is indistinguishable from the old always-overwrite bug — the reviewer sees
  // a familiar stock line and reasonably concludes the brief was ignored,
  // rather than "the director returned nothing usable for this one."
  const fallbackNote = usedStockHeading && usedStockFooter
    ? ' (Stock headline and footer — the director returned neither.)'
    : usedStockHeading
    ? ' (Stock headline — the director returned none.)'
    : usedStockFooter
    ? ' (Stock footer — the director\'s was missing or too long for one line.)'
    : '';

  return {
    ...concept,
    template: 'editorial',
    creativeDirectionId: direction.id,
    // Visual identity — always the direction's.
    wordmark: direction.wordmark,
    wordmarkSubtitle: direction.wordmarkSubtitle,
    bullets: [],
    photo_brief: direction.photoBrief,
    backgroundUrl: undefined,
    scrimStrength: direction.scrimStrength ?? 0.58,
    // Copy — the director's, with the direction as a safety net.
    heading: generatedHeading || direction.safeOverlay.heading,
    footer: generatedFooter && generatedFooter.length <= MAX_FOOTER_CHARS
      ? generatedFooter
      : direction.safeOverlay.footer,
    rationale: (concept.rationale
      ? `${direction.label}: ${concept.rationale}`
      : `${direction.label}: ${direction.description}`) + fallbackNote,
  };
}

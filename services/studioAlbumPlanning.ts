export const STUDIO_MIN_TRACK_SECONDS = 30;
export const STUDIO_MAX_TRACK_SECONDS = 165;
export const STUDIO_MAX_TRACKS = 40;
export const STUDIO_MAX_ALBUM_MINUTES = Math.floor((STUDIO_MAX_TRACK_SECONDS * STUDIO_MAX_TRACKS) / 60);

export interface StudioStylePreset {
  id: string;
  name: string;
  tagline: string;
  genre: string;
  mood: string;
  era: string;
  theme: string;
  vocal_direction: 'instrumental' | 'mostly_instrumental' | 'vocals';
  preferred_track_seconds: number;
  bpm_range: string;
  instruments: string[];
  prompt_guidance: string;
  artwork_direction: string;
}

export const STUDIO_STYLE_PRESETS: StudioStylePreset[] = [
  {
    id: 'groovy_organ', name: 'Groovy Organ', tagline: 'Warm organ-led grooves with a bright, rolling pocket.',
    genre: 'Groovy Organ Soul-Jazz', mood: 'Warm, playful, confident', era: '1960s–1970s inspired',
    theme: 'A lively neighborhood record shop on a sunny afternoon', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '92–112 BPM', instruments: ['Hammond-style organ', 'rotating speaker', 'clean guitar', 'electric bass', 'tight drums', 'hand percussion'],
    prompt_guidance: 'Organ leads the melody; use punchy soul-jazz rhythm sections, tasteful guitar responses, and upbeat but unhurried grooves.',
    artwork_direction: 'Warm analog color, playful mid-century shapes, sunlit record-store energy, rich amber and avocado tones.',
  },
  {
    id: 'jazz_spy', name: 'Jazz Spy', tagline: 'Suspenseful cinematic jazz without borrowed franchise references.',
    genre: 'Spy Jazz', mood: 'Mysterious, elegant, propulsive', era: '1960s inspired',
    theme: 'A stylish coastal intelligence operation with vintage European intrigue', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '86–124 BPM', instruments: ['surf guitar', 'muted trumpet', 'vibraphone', 'upright bass', 'brushed drums', 'dramatic brass'],
    prompt_guidance: 'Use original cinematic lounge language, shifting tension, crisp motifs, and dramatic brass accents; never name real spies, films, artists, or themes.',
    artwork_direction: 'Original mid-century suspense illustration, Riviera geometry, tailored silhouettes, bold teal, cream, and crimson.',
  },
  {
    id: 'saturday_morning_lounge', name: 'Saturday Morning Lounge', tagline: 'Easy, sunlit music for coffee, reading, and an unhurried start.',
    genre: 'Morning Lounge Jazz', mood: 'Sunny, relaxed, restorative', era: '1970s inspired contemporary',
    theme: 'A quiet Saturday morning with coffee, open windows, plants, and soft sunlight', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '72–94 BPM', instruments: ['Rhodes electric piano', 'mellow organ', 'clean guitar', 'upright bass', 'brushed drums', 'soft percussion'],
    prompt_guidance: 'Keep arrangements airy and melodic with gentle pocket, warm keys, subtle organ color, and no nightlife or romance language.',
    artwork_direction: 'Soft morning light, warm wood, coffee, houseplants, linen textures, calm editorial photography or illustration.',
  },
  {
    id: 'midnight_jazz', name: 'Midnight Jazz', tagline: 'Polished, mysterious jazz for focused evening listening.',
    genre: 'Cinematic Jazz', mood: 'Mysterious, focused, sophisticated', era: 'Contemporary with mid-century influence',
    theme: 'A rain-lit city lounge viewed through tall windows', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '68–92 BPM', instruments: ['tenor saxophone', 'Rhodes electric piano', 'upright bass', 'brushed drums', 'muted trumpet'],
    prompt_guidance: 'Favor restrained quartet arrangements, clean studio sound, memorable melodic phrases, and a gradual album-wide energy arc.',
    artwork_direction: 'Rain reflections, architectural shadows, deep navy and amber, elegant editorial composition without text.',
  },
];

export interface StudioRuntimePlan {
  target_seconds: number;
  track_count: number;
  track_durations: number[];
  preferred_track_seconds: number;
}

const wholeSeconds = (value: number) => Math.round(Number(value));

export function distributeStudioRuntime(targetSeconds: number, trackCount: number): number[] {
  const target = wholeSeconds(targetSeconds);
  const count = wholeSeconds(trackCount);
  if (!Number.isInteger(target) || target < STUDIO_MIN_TRACK_SECONDS) throw new Error(`Album runtime must be at least ${STUDIO_MIN_TRACK_SECONDS} seconds.`);
  if (!Number.isInteger(count) || count < 1 || count > STUDIO_MAX_TRACKS) throw new Error(`Track count must be between 1 and ${STUDIO_MAX_TRACKS}.`);
  if (target < count * STUDIO_MIN_TRACK_SECONDS || target > count * STUDIO_MAX_TRACK_SECONDS) {
    throw new Error(`${count} tracks cannot cover ${target} seconds within the ${STUDIO_MIN_TRACK_SECONDS}–${STUDIO_MAX_TRACK_SECONDS} second track range.`);
  }
  const base = Math.floor(target / count);
  const remainder = target % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function planStudioRuntime(targetSeconds: number, preferredTrackSeconds = 150, requestedTrackCount?: number): StudioRuntimePlan {
  const target = wholeSeconds(targetSeconds);
  const preferred = Math.min(STUDIO_MAX_TRACK_SECONDS, Math.max(STUDIO_MIN_TRACK_SECONDS, wholeSeconds(preferredTrackSeconds)));
  if (target < STUDIO_MIN_TRACK_SECONDS) throw new Error(`Album runtime must be at least ${STUDIO_MIN_TRACK_SECONDS} seconds.`);
  if (target > STUDIO_MAX_TRACK_SECONDS * STUDIO_MAX_TRACKS) throw new Error(`Album runtime exceeds the current ${STUDIO_MAX_ALBUM_MINUTES}-minute production limit.`);
  const minimumTracks = Math.ceil(target / STUDIO_MAX_TRACK_SECONDS);
  const maximumTracks = Math.min(STUDIO_MAX_TRACKS, Math.floor(target / STUDIO_MIN_TRACK_SECONDS));
  const desired = requestedTrackCount == null ? Math.round(target / preferred) : wholeSeconds(requestedTrackCount);
  const trackCount = Math.min(maximumTracks, Math.max(minimumTracks, desired));
  return { target_seconds: target, track_count: trackCount, track_durations: distributeStudioRuntime(target, trackCount), preferred_track_seconds: preferred };
}

export function getStudioStylePreset(id?: string | null): StudioStylePreset {
  return STUDIO_STYLE_PRESETS.find(preset => preset.id === id) || STUDIO_STYLE_PRESETS[0];
}

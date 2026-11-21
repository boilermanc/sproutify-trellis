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
  mood_collection?: string;
  paired_art_style_id?: string;
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
    id: 'french_riviera_60s', name: 'French Riviera ’60s', tagline: 'Sunny cinematic lounge with bossa nova rhythms, elegant orchestration, and glamorous vintage Mediterranean style.',
    genre: '1960s French Riviera Cinematic Lounge', mood: 'Sunny, playful, polished, sophisticated', era: 'Late 1960s inspired',
    theme: 'Arriving at a luxury Cannes hotel in a vintage convertible in 1968', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '105–120 BPM', instruments: ['brushed acoustic drums', 'warm upright bass', 'nylon-string bossa nova guitar', 'vibraphone', 'glockenspiel', 'flute', 'muted trumpet', 'Hammond organ', 'vintage electric piano', 'sweeping strings'],
    prompt_guidance: 'Blend French and Italian film-score lounge, light bossa nova, orchestral pop, easy-listening jazz, and vintage production-library music. Use a lightly syncopated Latin swing, memorable cinematic melody, tasteful orchestral flourishes, smooth transitions, natural acoustic instruments, and warm analog tape character without heavy improvisation. No vocals, modern synthesizers, EDM drums, trap percussion, lo-fi hip-hop beats, heavy jazz solos, aggressive brass, disco bass, trailer percussion, dark suspense, or contemporary pop production.',
    artwork_direction: 'Sun-faded late-1960s French Riviera travel editorial with a Cannes luxury hotel, Mediterranean coastline, vintage convertible, linen resort clothing, elegant old-money warmth, authentic Kodachrome color, and generous cinematic negative space.',
    mood_collection: 'French Riviera ’60s', paired_art_style_id: 'photoreal_60s',
  },
  {
    id: 'mystical_new_age', name: 'Mystical New Age', tagline: 'Ethereal downtempo music with atmospheric synths, world percussion, distant voices, and a mysterious spiritual mood.',
    genre: 'Mystical New Age Chillout', mood: 'Dreamlike, spiritual, mysterious, peaceful', era: '1990s-inspired contemporary',
    theme: 'A luminous contemplative journey through ancient landscapes, mist, and quiet revelation', vocal_direction: 'mostly_instrumental', preferred_track_seconds: 150,
    bpm_range: '75–90 BPM', instruments: ['deep soft electronic kick', 'restrained world percussion', 'breath-like rhythmic textures', 'warm synth bass', 'expansive atmospheric pads', 'haunting flute', 'distant choir textures', 'delicate wordless female vocalizations'],
    prompt_guidance: 'Build a steady softened downtempo pulse around a simple repeating minor-key bass progression, recognizable ethereal melodies, expansive pads, subtle world percussion, distant choir color, and delicate wordless female vocal textures. Develop gradually through long reverb tails, gentle echoes, immersive stereo layers, and slow evolving transitions rather than verse-and-chorus sections. Keep the spiritual atmosphere mysterious, peaceful, warm, and emotionally uplifting rather than dark. No intelligible lyrics, pop vocals, EDM drops, bright dance synthesizers, aggressive drums, trap percussion, corporate music, jazz improvisation, acoustic singer-songwriter elements, horror effects, or trailer impacts.',
    artwork_direction: 'Luminous contemplative nature and ancient stone architecture, soft mist, warm dawn light, expansive skies, subtle sacred geometry, calm human-scale detail, and an uplifting spiritual atmosphere without horror or dark occult imagery.',
    mood_collection: 'Mystical New Age',
  },
  {
    id: 'quiet_intelligence', name: 'Quiet Intelligence', tagline: 'Low-cortisol ambient jazz with space, restraint, and architectural calm.',
    genre: 'Minimalist Ambient Jazz', mood: 'Calm, intelligent, introspective, luxurious', era: 'Contemporary with subtle mid-century influence',
    theme: 'A serene modernist interior designed for deep focus and quiet confidence', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '68–78 BPM', instruments: ['Rhodes electric piano', 'felt piano', 'warm upright bass', 'brushed drums', 'muted trumpet', 'breathy tenor saxophone', 'subtle atmospheric pads'],
    prompt_guidance: 'Keep the pulse soft and nearly flat, with sparse short phrases, generous silence, seventh and ninth chords, warm tape color, dark room ambience, soft transients, and spacious reverb. No vocals, catchy hooks, bright solos, upbeat café jazz, swing exaggeration, bebop, funk, jazz-hop beats, dramatic builds, busy percussion, or excessive vinyl crackle.',
    artwork_direction: 'Serene modernist architecture, warm natural materials, precise negative space, soft shadow, muted charcoal and amber, premium editorial restraint without text.',
    mood_collection: 'Quiet Intelligence', paired_art_style_id: 'cinematic_architectural_minimalism',
  },
  {
    id: 'smooth_noir_jazz', name: 'Smooth Noir Jazz', tagline: 'Slow saxophone, smoky piano and late-night cinematic elegance.',
    genre: 'Slow Smooth Noir Jazz', mood: 'Intimate, reflective, romantic, smoky, slightly melancholic', era: '1940s–1960s inspired contemporary',
    theme: 'An elegant late-night lounge after the story has already happened', vocal_direction: 'instrumental', preferred_track_seconds: 150,
    bpm_range: '55–70 BPM', instruments: ['breathy tenor saxophone', 'dark acoustic piano', 'slow upright bass', 'brushed snare', 'muted kick', 'delicate ride cymbal', 'restrained jazz guitar', 'muted trumpet', 'occasional strings'],
    prompt_guidance: 'Use dark minor-seventh, major-seventh, and ninth-chord harmony with a slow, memorable but understated saxophone melody, generous narration space, warm tape color, soft transients, subtle room ambience, and dark natural reverb. Allow only restrained hints of Latin-jazz rhythm. No upbeat swing, bebop, cheerful café jazz, bright brass sections, energetic solos, trap drums, lo-fi hip-hop beats, excessive vinyl crackle, vocals, action scoring, or exaggerated detective clichés.',
    artwork_direction: 'Cinematic vintage-noir luxury interior after midnight, one elegant solitary figure, rain-streaked glass, warm practical lamps, deep shadows, atmospheric haze, desaturated charcoal and amber, and restrained analog-film character.',
    mood_collection: 'After Midnight', paired_art_style_id: 'cinematic_vintage_noir',
  },
  {
    id: 'positive_chill_house', name: 'Positive Chill House', tagline: 'Warm electronic grooves, wordless textures, and relaxed morning energy.',
    genre: 'Positive Chill House', mood: 'Fresh, optimistic, productive, emotionally light', era: 'Contemporary polished electronic',
    theme: 'Sunlight entering a beautiful modern home at the beginning of a productive day', vocal_direction: 'instrumental', preferred_track_seconds: 120,
    bpm_range: '105–115 BPM', instruments: ['soft four-on-the-floor kick', 'warm rounded electronic bass', 'finger snaps', 'delicate shakers', 'restrained hi-hats', 'airy synth pads', 'electric piano', 'soft melodic plucks', 'abstract wordless vocal textures'],
    prompt_guidance: 'Maintain a steady, quietly energizing house pulse with bright simple motifs, smooth transitions, soft transients, clean modern production, and a warm spacious mix. Wordless vocal textures may appear only as subtle atmospheric instrumentation, never intelligible lyrics. No festival EDM, heavy bass drops, aggressive sidechain pumping, nightclub energy, tropical-house clichés, prominent vocals, bright corporate music, ukulele, trap drums, harsh synth leads, or dramatic cinematic tension.',
    artwork_direction: 'Sunlit lifestyle editorial in a beautiful contemporary home, with one naturally relaxed stylish person, enormous windows, warm morning light, cream textiles, pale walls, light oak, subtle greenery, restrained lifestyle details, and generous negative space.',
    mood_collection: 'Morning Flow', paired_art_style_id: 'sunlit_lifestyle_editorial',
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

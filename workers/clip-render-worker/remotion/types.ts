export interface PromoVerticalScene {
  id: string;
  duration_seconds: number;
  media_type: 'still' | 'video';
  source: string;
  fit: 'contain' | 'cover';
}

export interface PromoVerticalCaption {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface PromoVerticalStoryProps {
  duration_seconds: number;
  scenes: PromoVerticalScene[];
  captions: PromoVerticalCaption[];
  voice_source?: string;
  music_source?: string;
  music_volume?: number;
  safe_area: { top: number; right: number; bottom: number; left: number };
  brand: {
    name?: string;
    logo_source?: string;
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
    font_family?: string;
  };
  review?: { overlay?: string; provenance_label?: string };
  end_card?: { start_seconds: number; title?: string; subtitle?: string };
}

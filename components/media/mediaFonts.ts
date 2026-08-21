import type { MediaFontId } from '../../types';

export const MEDIA_FONT_OPTIONS: Array<{ id: MediaFontId; label: string; family: string }> = [
  { id: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif' },
  { id: 'abril', label: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  { id: 'oswald', label: 'Oswald', family: '"Oswald", Impact, sans-serif' },
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat", Arial, sans-serif' },
  { id: 'inter', label: 'Inter', family: '"Inter", Arial, sans-serif' },
  { id: 'jetbrains', label: 'JetBrains Mono', family: '"JetBrains Mono", "Courier New", monospace' },
];

export const MEDIA_FONT_FAMILIES = Object.fromEntries(
  MEDIA_FONT_OPTIONS.map(option => [option.id, option.family]),
) as Record<MediaFontId, string>;

export function mediaFontIdForFamily(value?: string | null): MediaFontId {
  const normalized = String(value || '').toLowerCase();
  return MEDIA_FONT_OPTIONS.find(option => normalized.includes(option.label.toLowerCase().split(' ')[0]))?.id || 'inter';
}

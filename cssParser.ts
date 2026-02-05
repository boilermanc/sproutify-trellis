// ═══════════════════════════════════════════════════════════════
// CSS PARSER - Extracts colors and fonts from CSS files
// ═══════════════════════════════════════════════════════════════

export interface ParsedCSS {
  colors: string[];      // Unique hex colors found
  fonts: string[];       // Unique font families found
}

// Regex patterns
const HEX_COLOR_REGEX = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;
const RGB_REGEX = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi;
const RGBA_REGEX = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*[\d.]+\s*\)/gi;
const FONT_FAMILY_REGEX = /font-family\s*:\s*([^;]+)/gi;

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function normalizeHex(hex: string): string {
  // Convert 3-digit hex to 6-digit
  if (hex.length === 4) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toUpperCase();
}

function cleanFontName(font: string): string {
  return font
    .trim()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCSS(cssContent: string): ParsedCSS {
  const colors = new Set<string>();
  const fonts = new Set<string>();

  // Extract hex colors
  const hexMatches = cssContent.match(HEX_COLOR_REGEX) || [];
  hexMatches.forEach(hex => {
    const normalized = normalizeHex(hex);
    // Filter out near-black and near-white unless they're exact
    colors.add(normalized);
  });

  // Extract rgb() colors
  let rgbMatch;
  const rgbRegex = new RegExp(RGB_REGEX.source, 'gi');
  while ((rgbMatch = rgbRegex.exec(cssContent)) !== null) {
    const hex = rgbToHex(
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3])
    );
    colors.add(hex.toUpperCase());
  }

  // Extract rgba() colors
  let rgbaMatch;
  const rgbaRegex = new RegExp(RGBA_REGEX.source, 'gi');
  while ((rgbaMatch = rgbaRegex.exec(cssContent)) !== null) {
    const hex = rgbToHex(
      parseInt(rgbaMatch[1]),
      parseInt(rgbaMatch[2]),
      parseInt(rgbaMatch[3])
    );
    colors.add(hex.toUpperCase());
  }

  // Extract font families
  let fontMatch;
  const fontRegex = new RegExp(FONT_FAMILY_REGEX.source, 'gi');
  while ((fontMatch = fontRegex.exec(cssContent)) !== null) {
    const fontList = fontMatch[1].split(',');
    fontList.forEach(font => {
      const cleaned = cleanFontName(font);
      // Filter out generic font families
      if (cleaned && !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit'].includes(cleaned.toLowerCase())) {
        fonts.add(cleaned);
      }
    });
  }

  return {
    colors: Array.from(colors),
    fonts: Array.from(fonts)
  };
}

// Suggest palette roles based on color frequency and properties
export function suggestColorRoles(colors: string[]): {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
} {
  // Default fallback
  const defaults = {
    primary: '#3B82F6',
    secondary: '#6B7280',
    accent: '#F59E0B',
    neutral: '#F3F4F6'
  };

  if (colors.length === 0) return defaults;

  // Simple heuristic:
  // - First saturated color = primary
  // - Second saturated = secondary or accent
  // - Lightest = neutral

  const analyzed = colors.map(hex => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2 / 255;
    const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1)) / 255;
    return { hex, lightness, saturation };
  });

  // Sort by saturation (most saturated first)
  const saturated = analyzed
    .filter(c => c.saturation > 0.2 && c.lightness > 0.1 && c.lightness < 0.9)
    .sort((a, b) => b.saturation - a.saturation);

  // Find neutral (high lightness, low saturation)
  const neutrals = analyzed
    .filter(c => c.lightness > 0.8 || c.saturation < 0.1)
    .sort((a, b) => b.lightness - a.lightness);

  return {
    primary: saturated[0]?.hex || defaults.primary,
    secondary: saturated[1]?.hex || saturated[0]?.hex || defaults.secondary,
    accent: saturated[2]?.hex || saturated[1]?.hex || defaults.accent,
    neutral: neutrals[0]?.hex || defaults.neutral
  };
}

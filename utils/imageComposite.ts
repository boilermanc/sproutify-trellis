// Real-text overlay compositor.
//
// AI image models can't reliably render a specific typeface, so the pipeline
// now generates a CLEAN image (no text) and this module burns the headline
// on top in the real brand font using a <canvas>. Keep the fractional maths
// here in sync with `components/TextOverlayEditor.tsx`'s live preview — both
// must resolve `TextOverlayLayer` fields against the same width/height basis
// or the preview will lie about the final composite.

import type { TextOverlayConfig, TextOverlayLayer } from '../types';

// ─── Fonts ──────────────────────────────────────────────────────────────

export interface FontOption {
  value: string;
  label: string;
  /** Google Fonts family name, if it differs from `value` (e.g. spacing). */
  googleFamily?: string;
}

// Curated for ad headlines: a mix of neutral, humanist, condensed/impact,
// and serif options. `branches.font_family` is 'Inter' for every brand today,
// so Inter is the safe default until brand-specific fonts are configured.
export const FONT_OPTIONS: FontOption[] = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Lora', label: 'Lora' },
  { value: 'Archivo Black', label: 'Archivo Black' },
];

const loadedFontLinks = new Set<string>();

/**
 * Loads a Google Font family by injecting a <link> tag (idempotent — a
 * family is only ever injected once) and waits for the browser's font
 * loading APIs so canvas text draws with real glyphs instead of a fallback
 * font. Always resolves — a network failure or unsupported browser degrades
 * to the system fallback instead of blocking the caller.
 */
export function ensureFontLoaded(family: string, weight: number = 700): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!family) {
      resolve();
      return;
    }

    try {
      if (!loadedFontLinks.has(family) && typeof document !== 'undefined') {
        loadedFontLinks.add(family);
        const familyParam = family.trim().replace(/\s+/g, '+');
        const href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;500;600;700;800;900&display=swap`;
        const existing = document.querySelector(`link[data-trellis-font="${family}"]`);
        if (!existing) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.setAttribute('data-trellis-font', family);
          document.head.appendChild(link);
        }
      }

      if (typeof document === 'undefined' || !('fonts' in document) || !document.fonts) {
        // Older browser — nothing more we can do, let the caller fall back.
        resolve();
        return;
      }

      const spec = `${weight} 32px "${family}"`;
      Promise.resolve(document.fonts.load(spec))
        .catch(() => undefined)
        .then(() => document.fonts.ready.catch(() => undefined))
        .then(() => resolve())
        .catch(() => resolve());
    } catch {
      // Never let a font-loading failure block compositing.
      resolve();
    }
  });
}

// ─── Default layer ──────────────────────────────────────────────────────

let layerIdCounter = 0;
function nextLayerId(): string {
  layerIdCounter += 1;
  return `layer-${Date.now().toString(36)}-${layerIdCounter}`;
}

/**
 * A sensible starting overlay for a fresh headline: bottom-third, centered,
 * with a scrim behind it for legibility over busy photography.
 */
export function defaultOverlayForHeadline(
  headline: string,
  opts: { fontFamily?: string; color?: string } = {}
): TextOverlayConfig {
  const layer: TextOverlayLayer = {
    id: nextLayerId(),
    text: headline,
    x: 0.5,
    y: 0.78,
    widthPct: 0.86,
    fontSize: 0.075,
    fontFamily: opts.fontFamily || 'Inter',
    fontWeight: 800,
    color: opts.color || '#ffffff',
    align: 'center',
    lineHeight: 1.1,
    letterSpacing: 0.01,
    uppercase: false,
    shadow: true,
  };

  return { layers: [layer], scrim: 'bottom' };
}

// ─── Word wrap ───────────────────────────────────────────────────────────

/**
 * Word-wraps `layer.text` to fit within `layer.widthPct` of `imgW`, honoring
 * letter-spacing so the measured width matches what will actually be drawn.
 * Exported so the live preview (DOM/CSS) and the canvas compositor agree on
 * line breaks pixel-for-pixel — call it with a ctx already configured with
 * the layer's font (see `applyLayerFont` usage in `compositeOverlay`).
 */
export function wrapLayerText(
  ctx: CanvasRenderingContext2D,
  layer: TextOverlayLayer,
  imgW: number,
  imgH: number
): string[] {
  const rawText = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const maxWidth = Math.max(1, layer.widthPct * imgW);
  const fontSizePx = layer.fontSize * imgH;
  const letterSpacingPx = layer.letterSpacing * fontSizePx;

  const measure = (str: string): number => {
    if (!str) return 0;
    const base = ctx.measureText(str).width;
    // Manual letter-spacing approximation for browsers/paths that don't
    // apply ctx.letterSpacing to measureText.
    const extra = str.length > 1 ? (str.length - 1) * letterSpacingPx : 0;
    return base + extra;
  };

  const paragraphs = rawText.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const candidate = `${currentLine} ${word}`;
      if (measure(candidate) <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

// ─── Compositing ─────────────────────────────────────────────────────────

function buildFontString(layer: TextOverlayLayer, fontSizePx: number): string {
  return `${layer.fontWeight} ${fontSizePx}px "${layer.fontFamily}", sans-serif`;
}

function supportsCanvasLetterSpacing(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx;
}

/**
 * Draws a single line of text at (x, y) honoring letter-spacing. Uses the
 * native `ctx.letterSpacing` where supported; otherwise falls back to
 * manual per-character drawing so spacing still renders correctly on older
 * browsers/canvas backends that lack the property.
 */
function drawTrackedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  letterSpacingPx: number,
  align: 'left' | 'center' | 'right'
): void {
  if (supportsCanvasLetterSpacing(ctx)) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`;
    ctx.textAlign = align;
    ctx.fillText(line, x, y);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    return;
  }

  if (letterSpacingPx === 0 || line.length === 0) {
    ctx.textAlign = align;
    ctx.fillText(line, x, y);
    return;
  }

  // Manual fallback: measure total tracked width, then draw char-by-char
  // left-to-right starting from the correct anchor for the alignment.
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  const chars = Array.from(line);
  const charWidths = chars.map((c) => ctx.measureText(c).width);
  const totalWidth = charWidths.reduce((sum, w) => sum + w, 0) + letterSpacingPx * Math.max(0, chars.length - 1);

  let startX = x;
  if (align === 'center') startX = x - totalWidth / 2;
  else if (align === 'right') startX = x - totalWidth;

  let cursor = startX;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += charWidths[i] + letterSpacingPx;
  }

  ctx.textAlign = savedAlign;
}

function applyScrim(
  ctx: CanvasRenderingContext2D,
  scrim: TextOverlayConfig['scrim'],
  w: number,
  h: number
): void {
  if (!scrim || scrim === 'none') return;

  let gradient: CanvasGradient;
  if (scrim === 'bottom') {
    gradient = ctx.createLinearGradient(0, h * 0.45, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.65)');
  } else if (scrim === 'top') {
    gradient = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    gradient.addColorStop(0, 'rgba(0,0,0,0.65)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    // full
    gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0.35)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: TextOverlayLayer, imgW: number, imgH: number): void {
  const text = layer.text?.trim();
  if (!text) return; // Skip empty layers.

  const fontSizePx = Math.max(1, layer.fontSize * imgH);
  const letterSpacingPx = layer.letterSpacing * fontSizePx;

  ctx.save();
  ctx.font = buildFontString(layer, fontSizePx);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = layer.color || '#ffffff';

  const lines = wrapLayerText(ctx, layer, imgW, imgH);
  const lineHeightPx = fontSizePx * (layer.lineHeight || 1.15);
  const blockHeight = lineHeightPx * lines.length;

  const anchorX = layer.x * imgW;
  // y is treated as the vertical anchor for the text block's baseline area;
  // center the block on it so dragging feels natural in the editor.
  const blockTop = layer.y * imgH - blockHeight / 2;

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = fontSizePx * 0.25;
    ctx.shadowOffsetY = fontSizePx * 0.06;
    ctx.shadowOffsetX = 0;
  }

  lines.forEach((line, i) => {
    // Baseline sits ~0.8 of the font size below the line's top, which
    // approximates most Latin fonts' ascent.
    const lineTop = blockTop + i * lineHeightPx;
    const baselineY = lineTop + fontSizePx * 0.8;
    drawTrackedLine(ctx, line, anchorX, baselineY, letterSpacingPx, layer.align);
  });

  ctx.restore();
}

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load source image for compositing: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * Renders `config`'s text layers on top of the image at `imageUrl` at the
 * image's native resolution and resolves a PNG Blob. The source image must
 * be served with permissive CORS headers (Supabase Storage public URLs are)
 * or the canvas becomes "tainted" and `toBlob` will fail — that failure is
 * caught and rethrown with a clear message pointing at CORS.
 */
export async function compositeOverlay(imageUrl: string, config: TextOverlayConfig): Promise<Blob> {
  const img = await loadImage(imageUrl);

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error('Source image has no natural dimensions to composite against.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  applyScrim(ctx, config.scrim, width, height);

  for (const layer of config.layers) {
    // Make sure the requested font is available before measuring/drawing;
    // ensureFontLoaded never rejects, and by the time an editor calls this
    // the family has typically already been preloaded — this is a safety net.
    // eslint-disable-next-line no-await-in-loop
    await ensureFontLoaded(layer.fontFamily, layer.fontWeight);
    drawLayer(ctx, layer, width, height);
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Compositing failed: canvas produced no image data (possible CORS taint on the source image).'));
          return;
        }
        resolve(blob);
      // JPEG, not PNG: Instagram's publishing API rejects PNG at container
      // creation. Flattened ad creative has no transparency to preserve.
      }, 'image/jpeg', 0.92);
    } catch (err) {
      reject(
        new Error(
          `Compositing failed, likely due to a CORS-tainted canvas from the source image (${imageUrl}). ` +
            `Ensure the image host sends permissive CORS headers. Original error: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  });
}

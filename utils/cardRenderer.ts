// Designed-post-card renderer.
//
// Image models can't reliably render text or lay out a grid (see
// `imageComposite.ts`'s header comment for why this project already burns
// headlines onto photos in real fonts rather than asking a model to draw
// them). Some posts aren't photographs at all — a verse on a gradient, a
// typographic statement, an emotion grid — so those are DRAWN straight from
// a `CardConcept` onto a <canvas> instead of generated. This module is the
// "renderer" half: an AI creative director produces the concept (elsewhere),
// this turns it into a real PNG.
//
// No SVG rasterization here on purpose: rasterizing an SVG via `new Image()`
// loads it through the browser's image pipeline, which does NOT wait for
// external @font-face rules the way on-page canvas text does — the custom
// fonts silently fail to load and Chrome/Safari fall back to a system font,
// ruining the typography with no error to catch. Drawing directly on a
// canvas keeps us in the `document.fonts` world where `ensureFontLoaded`
// actually works.

import type { CardConcept, CardPalette, CardTemplate } from '../types';
import { ensureFontLoaded, FONT_OPTIONS } from './imageComposite';

// ─── Constants ───────────────────────────────────────────────────────────

export const CARD_SIZE = { width: 1080, height: 1350 } as const; // 4:5, IG portrait

// Fraunces/Playfair-style serif for display text, Inter for UI/labels.
// Both are already curated in FONT_OPTIONS so we don't add a new dependency
// or a new Google Fonts family to load.
const SERIF_OPTION = FONT_OPTIONS.find((f) => f.value === 'Playfair Display');
const SANS_OPTION = FONT_OPTIONS.find((f) => f.value === 'Inter');

export const CARD_FONTS = {
  serif: SERIF_OPTION?.value ?? 'Playfair Display',
  sans: SANS_OPTION?.value ?? 'Inter',
};

// ─── Small drawing helpers ───────────────────────────────────────────────

/**
 * Rounded rectangle path. `ctx.roundRect` isn't available on every canvas
 * backend (older browsers, some headless/testing canvases), so feature-detect
 * and fall back to a manual arc-based path rather than assuming it exists.
 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === 'function') {
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
      x,
      y,
      w,
      h,
      r
    );
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Word-wraps `text` to fit within `maxWidth` at the ctx's current font,
 * honoring hard line breaks (`\n`) in addition to soft-wrapping long lines.
 * Callers must set `ctx.font` (and any letter-spacing) BEFORE calling this,
 * since measurement depends on it.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = (text ?? '').split('\n');
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
      if (ctx.measureText(candidate).width <= maxWidth) {
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

/**
 * Measures the total block height a wrapped run of `text` would occupy at
 * `fontSizePx` and returns both the lines and the height, without drawing.
 * Used to drive auto-shrink: try a size, measure, shrink a step if it
 * doesn't fit, then actually draw once a size fits (or the shrink floor is
 * hit, in which case we draw the smallest size anyway rather than throw).
 */
function measureWrappedBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSizePx: number,
  lineHeightMultiplier: number
): { lines: string[]; height: number } {
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeightPx = fontSizePx * lineHeightMultiplier;
  return { lines, height: lines.length * lineHeightPx };
}

interface FitResult {
  lines: string[];
  fontSizePx: number;
  lineHeightPx: number;
}

/**
 * Picks the largest font size (walking down from `startPx` in `stepPx`
 * decrements, floor `minPx`) whose wrapped block fits within `maxHeight`.
 * `applyFont` must set ctx.font (and anything else that affects measurement,
 * e.g. letter-spacing) for a given pixel size — called once per candidate
 * size since re-measuring requires the font to already be set.
 */
function fitTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startPx: number,
  minPx: number,
  stepPx: number,
  lineHeightMultiplier: number,
  applyFont: (fontSizePx: number) => void
): FitResult {
  let fontSizePx = startPx;
  let lines: string[] = [];
  let lineHeightPx = fontSizePx * lineHeightMultiplier;

  while (fontSizePx >= minPx) {
    applyFont(fontSizePx);
    const measured = measureWrappedBlock(ctx, text, maxWidth, fontSizePx, lineHeightMultiplier);
    lines = measured.lines;
    lineHeightPx = fontSizePx * lineHeightMultiplier;
    if (measured.height <= maxHeight || fontSizePx <= minPx) {
      break;
    }
    fontSizePx = Math.max(minPx, fontSizePx - stepPx);
  }

  // Ensure the font actually applied for the size we settled on (the loop's
  // last iteration always calls applyFont, but guard the minPx-only path too).
  applyFont(fontSizePx);
  return { lines, fontSizePx, lineHeightPx };
}

function fontString(weight: number, sizePx: number, family: string, italic = false): string {
  const style = italic ? 'italic ' : '';
  return `${style}${weight} ${sizePx}px "${family}", sans-serif`;
}

function safeText(v: string | undefined | null): string {
  return typeof v === 'string' ? v : '';
}

// ─── Background ──────────────────────────────────────────────────────────

function paintBackground(ctx: CanvasRenderingContext2D, palette: CardPalette, W: number, H: number, diagonal: boolean): void {
  const bg1 = palette?.bg1 || '#111111';
  const bg2 = palette?.bg2;

  if (!bg2) {
    ctx.fillStyle = bg1;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  let gradient: CanvasGradient;
  if (diagonal) {
    gradient = ctx.createLinearGradient(0, 0, W, H);
  } else {
    // Radial: centered, reaching past the far corner so corners aren't flat.
    const r = Math.hypot(W, H) * 0.6;
    gradient = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, r);
  }
  gradient.addColorStop(0, bg1);
  gradient.addColorStop(1, bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

/** Soft radial glow using the accent color, for depth behind the verse text. */
function paintAccentGlow(ctx: CanvasRenderingContext2D, accent: string, W: number, H: number): void {
  if (!accent) return;
  ctx.save();
  const cx = W * 0.5;
  const cy = H * 0.55;
  const r = W * 0.65;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, hexToRgba(accent, 0.28));
  glow.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Converts a `#rrggbb`/`#rgb` hex color to an rgba() string; passes through
 * anything that isn't a hex string (e.g. already rgba/hsl) unchanged aside
 * from ignoring the alpha override in that case. Never throws on bad input —
 * falls back to a neutral gray glow instead of skipping the effect. */
function hexToRgba(color: string, alpha: number): string {
  const hex = (color || '').trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    // Not a hex color we can parse — degrade gracefully rather than throw.
    return `rgba(150,150,150,${alpha})`;
  }
  let r: number;
  let g: number;
  let b: number;
  const digits = match[1];
  if (digits.length === 3) {
    r = parseInt(digits[0] + digits[0], 16);
    g = parseInt(digits[1] + digits[1], 16);
    b = parseInt(digits[2] + digits[2], 16);
  } else {
    r = parseInt(digits.slice(0, 2), 16);
    g = parseInt(digits.slice(2, 4), 16);
    b = parseInt(digits.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Shared text pieces ──────────────────────────────────────────────────

function drawEyebrow(ctx: CanvasRenderingContext2D, text: string, palette: CardPalette, W: number, topY: number): number {
  const eyebrow = safeText(text).trim();
  if (!eyebrow) return topY;

  const fontSizePx = W * 0.026;
  ctx.save();
  ctx.font = fontString(600, fontSizePx, CARD_FONTS.sans);
  ctx.fillStyle = palette?.muted || '#999999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  drawTracked(ctx, eyebrow.toUpperCase(), W / 2, topY, fontSizePx * 0.18, 'center');
  ctx.restore();
  return topY + fontSizePx * 1.6;
}

function drawLogoText(ctx: CanvasRenderingContext2D, text: string, palette: CardPalette, W: number, H: number): void {
  const logo = safeText(text).trim();
  if (!logo) return;

  const fontSizePx = W * 0.03;
  ctx.save();
  ctx.font = fontString(600, fontSizePx, CARD_FONTS.serif, true);
  ctx.fillStyle = palette?.text || '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(logo, W * 0.08, H - H * 0.055);
  ctx.restore();
}

/**
 * Draws a single line with manual letter-spacing (canvas `ctx.letterSpacing`
 * has patchier support than the wrap/measure paths need, and we want the
 * exact same rendering in preview and export regardless of browser) — draws
 * char-by-char so tracked eyebrow/reference text always looks right.
 */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  spacingPx: number,
  align: 'left' | 'center' | 'right'
): void {
  if (!line) return;
  if (spacingPx <= 0) {
    ctx.textAlign = align;
    ctx.fillText(line, x, y);
    return;
  }

  const chars = Array.from(line);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacingPx * Math.max(0, chars.length - 1);

  let startX = x;
  if (align === 'center') startX = x - total / 2;
  else if (align === 'right') startX = x - total;

  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let cursor = startX;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + spacingPx;
  }
  ctx.textAlign = savedAlign;
}

// ─── verse ───────────────────────────────────────────────────────────────

function drawVerse(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);
  paintAccentGlow(ctx, palette?.accent, W, H);

  const padX = W * 0.1;
  const maxWidth = W - padX * 2;

  let cursorY = H * 0.12;
  cursorY = drawEyebrow(ctx, concept.eyebrow, palette, W, cursorY);

  const body = safeText(concept.body).trim();
  if (body) {
    // Reserve room above (eyebrow) and below (reference + logo) so the
    // auto-shrink target height reflects what's actually left for the verse.
    const reservedBottom = H * 0.22;
    const maxBlockHeight = Math.max(H * 0.15, H - cursorY - reservedBottom);

    const lineHeightMultiplier = 1.35;
    const fit = fitTextBlock(
      ctx,
      body,
      maxWidth,
      maxBlockHeight,
      W * 0.058, // start size
      W * 0.03, // floor size
      W * 0.004, // step
      lineHeightMultiplier,
      (sizePx) => {
        ctx.font = fontString(300, sizePx, CARD_FONTS.serif);
      }
    );

    ctx.fillStyle = palette?.text || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const blockHeight = fit.lines.length * fit.lineHeightPx;
    // Center the verse block in the space between the eyebrow and the
    // reserved bottom area, rather than always hugging the top of that gap.
    const spaceTop = cursorY;
    const spaceHeight = H - reservedBottom - spaceTop;
    let lineTop = spaceTop + Math.max(0, (spaceHeight - blockHeight) / 2);

    for (const line of fit.lines) {
      const baselineY = lineTop + fit.fontSizePx * 0.85;
      ctx.fillText(line, W / 2, baselineY);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.3;
  }

  const reference = safeText(concept.reference).trim();
  if (reference) {
    const refSizePx = W * 0.022;
    ctx.save();
    ctx.font = fontString(600, refSizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#999999';
    ctx.textBaseline = 'alphabetic';
    const refY = Math.min(H - H * 0.14, cursorY + refSizePx * 1.4);
    drawTracked(ctx, reference.toUpperCase(), W / 2, refY, refSizePx * 0.16, 'center');
    ctx.restore();
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── statement ───────────────────────────────────────────────────────────

function drawStatement(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);

  const padX = W * 0.1;
  const maxWidth = W - padX * 2;

  let topY = H * 0.12;
  topY = drawEyebrow(ctx, concept.eyebrow, palette, W, topY);

  const statement = safeText(concept.statement).trim();
  const emphasis = safeText(concept.statementEmphasis).trim();
  const subline = safeText(concept.subline).trim();

  // Reserve room for the emphasis line, rule, subline and logo below so the
  // main statement's auto-shrink target doesn't collide with them.
  const reservedBelow = (emphasis ? H * 0.09 : 0) + (subline ? H * 0.06 : 0) + H * 0.02 + H * 0.16;
  const maxBlockHeight = Math.max(H * 0.15, H - topY - reservedBelow);

  let cursorY = topY;

  if (statement) {
    const lineHeightMultiplier = 1.05;
    const fit = fitTextBlock(
      ctx,
      statement,
      maxWidth,
      maxBlockHeight,
      W * 0.09,
      W * 0.045,
      W * 0.005,
      lineHeightMultiplier,
      (sizePx) => {
        ctx.font = fontString(600, sizePx, CARD_FONTS.serif);
        // Slightly negative tracking is approximated by nudging the draw
        // step; canvas has no native negative letter-spacing primitive that
        // works everywhere, so we rely on the serif's natural tight metrics
        // at display sizes and skip an explicit negative-spacing pass to
        // avoid glyphs overlapping unpredictably.
      }
    );

    ctx.fillStyle = palette?.text || '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const blockHeight = fit.lines.length * fit.lineHeightPx;
    const spaceHeight = maxBlockHeight;
    let lineTop = cursorY + Math.max(0, (spaceHeight - blockHeight) / 2);

    for (const line of fit.lines) {
      const baselineY = lineTop + fit.fontSizePx * 0.82;
      ctx.fillText(line, W / 2, baselineY);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.15;
  } else {
    cursorY += maxBlockHeight * 0.4;
  }

  if (emphasis) {
    const sizePx = W * 0.042;
    ctx.save();
    ctx.font = fontString(600, sizePx, CARD_FONTS.serif, true);
    ctx.fillStyle = palette?.accent || '#c9622a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, emphasis, maxWidth);
    for (const line of wrapped) {
      cursorY += sizePx * 1.15;
      ctx.fillText(line, W / 2, cursorY);
    }
    ctx.restore();
    cursorY += sizePx * 0.5;
  }

  // Short horizontal rule.
  const ruleWidth = W * 0.09;
  ctx.save();
  ctx.strokeStyle = palette?.text || '#111111';
  ctx.lineWidth = Math.max(1, W * 0.0035);
  cursorY += H * 0.02;
  ctx.beginPath();
  ctx.moveTo(W / 2 - ruleWidth / 2, cursorY);
  ctx.lineTo(W / 2 + ruleWidth / 2, cursorY);
  ctx.stroke();
  ctx.restore();

  if (subline) {
    const sizePx = W * 0.024;
    ctx.save();
    ctx.font = fontString(400, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#777777';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, subline, maxWidth);
    let y = cursorY + sizePx * 1.6;
    for (const line of wrapped) {
      ctx.fillText(line, W / 2, y);
      y += sizePx * 1.4;
    }
    ctx.restore();
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── grid ────────────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);

  const padX = W * 0.08;
  const maxWidth = W - padX * 2;

  let cursorY = H * 0.1;
  cursorY = drawEyebrow(ctx, concept.eyebrow, palette, W, cursorY);

  const heading = safeText(concept.heading).trim();
  if (heading) {
    const fit = fitTextBlock(ctx, heading, maxWidth, H * 0.16, W * 0.055, W * 0.032, W * 0.004, 1.15, (sizePx) => {
      ctx.font = fontString(500, sizePx, CARD_FONTS.serif);
    });
    ctx.fillStyle = palette?.text || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let lineTop = cursorY;
    for (const line of fit.lines) {
      ctx.fillText(line, W / 2, lineTop + fit.fontSizePx * 0.85);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.3;
  }

  const items = Array.isArray(concept.items) ? concept.items.filter((it) => typeof it === 'string' && it.trim()) : [];
  const footnote = safeText(concept.footnote).trim();

  // Reserve space below the grid for the footnote + logo so the grid itself
  // never crowds them out.
  const reservedBottom = (footnote ? H * 0.06 : 0) + H * 0.14;
  const gridTop = cursorY + H * 0.03;
  const gridBottom = H - reservedBottom;
  const gridHeight = Math.max(H * 0.1, gridBottom - gridTop);

  if (items.length > 0) {
    const cols = 3;
    const rows = Math.ceil(items.length / cols);
    const gap = W * 0.03;
    const cellW = (maxWidth - gap * (cols - 1)) / cols;
    const cellH = Math.min((gridHeight - gap * (rows - 1)) / rows, cellW * 1.05);
    const totalGridHeight = cellH * rows + gap * (rows - 1);
    // Vertically center the actual grid within the reserved area in case
    // fewer rows are needed than the space allows.
    const gridStartY = gridTop + Math.max(0, (gridHeight - totalGridHeight) / 2);

    const cellFontSizePx = Math.max(W * 0.017, cellW * 0.11);

    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padX + col * (cellW + gap);
      const y = gridStartY + row * (cellH + gap);
      const isHighlighted = i === concept.highlightIndex;

      ctx.save();
      roundedRectPath(ctx, x, y, cellW, cellH, Math.min(cellW, cellH) * 0.08);
      if (isHighlighted) {
        ctx.fillStyle = palette?.accent || '#c9622a';
        ctx.fill();
      } else {
        ctx.fillStyle = hexToRgba(palette?.text || '#ffffff', 0.06);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(palette?.text || '#ffffff', 0.35);
        ctx.stroke();
      }
      ctx.restore();

      // Label, wrapped and centered within the cell.
      ctx.save();
      const cellPad = cellW * 0.1;
      const cellMaxWidth = cellW - cellPad * 2;
      const fit = fitTextBlock(
        ctx,
        item,
        cellMaxWidth,
        cellH - cellPad * 2,
        cellFontSizePx,
        cellFontSizePx * 0.55,
        cellFontSizePx * 0.05,
        1.2,
        (sizePx) => {
          ctx.font = fontString(500, sizePx, CARD_FONTS.sans);
        }
      );
      ctx.fillStyle = isHighlighted ? '#ffffff' : palette?.text || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const blockHeight = fit.lines.length * fit.lineHeightPx;
      let lineTop = y + cellH / 2 - blockHeight / 2;
      for (const line of fit.lines) {
        ctx.fillText(line, x + cellW / 2, lineTop + fit.fontSizePx * 0.8);
        lineTop += fit.lineHeightPx;
      }
      ctx.restore();
    });

    cursorY = gridStartY + totalGridHeight + H * 0.02;
  } else {
    cursorY = gridTop;
  }

  if (footnote) {
    const sizePx = W * 0.02;
    ctx.save();
    ctx.font = fontString(400, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#999999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, footnote, maxWidth);
    let y = Math.max(cursorY + sizePx, gridBottom - (wrapped.length - 1) * sizePx * 1.4);
    for (const line of wrapped) {
      ctx.fillText(line, W / 2, y);
      y += sizePx * 1.4;
    }
    ctx.restore();
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── Entry points ────────────────────────────────────────────────────────

/**
 * Draws `concept` onto `ctx` at `W`x`H`. Exported so both the full-resolution
 * export path and the on-screen preview path call the exact same drawing
 * code — if they diverged, a reviewer could approve a preview that doesn't
 * match what actually ships. `W`/`H` are passed explicitly (rather than
 * read off ctx.canvas) so this works identically whether the canvas is at
 * native 1080x1350 or a scaled-down preview size.
 *
 * Never throws: an unexpected/missing field for the concept's template is
 * simply skipped (see the `safeText`/`Array.isArray` guards throughout each
 * template's draw function) so a malformed concept still renders whatever it
 * legitimately has.
 */
export function drawCard(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const template: CardTemplate = concept?.template === 'statement' || concept?.template === 'grid' ? concept.template : 'verse';

  try {
    switch (template) {
      case 'statement':
        drawStatement(ctx, concept, W, H);
        break;
      case 'grid':
        drawGrid(ctx, concept, W, H);
        break;
      case 'verse':
      default:
        drawVerse(ctx, concept, W, H);
        break;
    }
  } catch {
    // Defensive last resort: never let a malformed concept throw out of the
    // render pipeline. Paint at least a flat background with the logo so
    // the caller gets a usable (if minimal) image instead of a crash.
    try {
      paintBackground(ctx, concept?.palette, W, H, false);
      drawLogoText(ctx, concept?.logoText, concept?.palette, W, H);
    } catch {
      // Nothing more we can safely do.
    }
  }
}

async function loadFontsForConcept(): Promise<void> {
  // Fonts must be awaited BEFORE any ctx.measureText/fillText call, because
  // ctx.font accepts an unloaded family without error — the browser just
  // renders (and measures) with its fallback font until the real one
  // finishes loading. If we measured/wrapped text before the swap, the
  // wrap decisions and auto-shrink sizing would be computed against the
  // wrong metrics and could visibly reflow once the real font pops in.
  await Promise.all([ensureFontLoaded(CARD_FONTS.serif, 300), ensureFontLoaded(CARD_FONTS.serif, 600), ensureFontLoaded(CARD_FONTS.sans, 400), ensureFontLoaded(CARD_FONTS.sans, 500), ensureFontLoaded(CARD_FONTS.sans, 600)]);
}

function createCardCanvas(scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_SIZE.width * scale);
  canvas.height = Math.round(CARD_SIZE.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }
  if (scale !== 1) {
    ctx.scale(scale, scale);
  }
  return { canvas, ctx };
}

/**
 * Renders `concept` at full resolution (1080x1350, or that times `opts.scale`
 * for @2x-style export) and resolves a PNG Blob.
 */
export async function renderCardConcept(concept: CardConcept, opts: { scale?: number } = {}): Promise<Blob> {
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  await loadFontsForConcept();

  const { canvas, ctx } = createCardCanvas(scale);
  drawCard(ctx, concept, CARD_SIZE.width, CARD_SIZE.height);

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Card rendering failed: canvas produced no image data.'));
          return;
        }
        resolve(blob);
      // JPEG, not PNG: Instagram's content publishing API rejects PNG at
      // container creation, which fails the publish with an opaque error. These
      // cards are full-bleed with no transparency, so JPEG costs nothing.
      }, 'image/jpeg', 0.92);
    } catch (err) {
      reject(new Error(`Card rendering failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

// Preview scale: small enough to be fast/cheap for on-screen review, large
// enough that text doesn't look blurry in a typical review panel.
const PREVIEW_SCALE = 0.5;

/**
 * Renders `concept` at a smaller scale for on-screen preview and resolves a
 * data URL. Uses the exact same `drawCard` call as `renderCardConcept` (just
 * on a smaller canvas) so what a reviewer approves in the preview is
 * pixel-faithful to what the full export produces — only resolution differs.
 */
export async function renderCardPreviewDataUrl(concept: CardConcept): Promise<string> {
  await loadFontsForConcept();

  const { canvas, ctx } = createCardCanvas(PREVIEW_SCALE);
  drawCard(ctx, concept, CARD_SIZE.width, CARD_SIZE.height);

  return canvas.toDataURL('image/png');
}

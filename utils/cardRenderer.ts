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

import type { CardBullet, CardConcept, CardPalette, CardTemplate, BrandFontPairing } from '../types';
import { ensureFontLoaded, FONT_OPTIONS } from './imageComposite';

// ─── Constants ───────────────────────────────────────────────────────────

export const CARD_SIZE = { width: 1080, height: 1350 } as const; // 4:5, IG portrait

// Cards are usually viewed at roughly one third of their exported width in a
// mobile feed. Text below 3% of the canvas width therefore lands under about
// 11 CSS pixels and becomes decorative rather than readable. Keep secondary
// copy at or above this shared floor so references, sublines, footnotes and
// footer calls-to-action survive Instagram/Facebook downscaling.
export const CARD_TEXT_SCALE = {
  eyebrow: 0.03,
  secondary: 0.032,
  compact: 0.03,
  logo: 0.036,
} as const;

// Fraunces/Playfair-style serif for display text, Inter for UI/labels.
// Both are already curated in FONT_OPTIONS so we don't add a new dependency
// or a new Google Fonts family to load.
const SERIF_OPTION = FONT_OPTIONS.find((f) => f.value === 'Playfair Display');
const SANS_OPTION = FONT_OPTIONS.find((f) => f.value === 'Inter');

const DEFAULT_DISPLAY = SERIF_OPTION?.value ?? 'Playfair Display';
const DEFAULT_LABEL = SANS_OPTION?.value ?? 'Inter';

// CARD_FONTS carries two ROLES, not two fixed families: `serif` is the display
// voice (headlines, statement, wordmark, verse body, the big stat figure) and
// `sans` is the label/UI face (eyebrow, tracked footer caps, bullet text,
// references, grid labels, stat unit). Every renderer and helper already reaches
// for one of these two roles. To render a brand's own pairing, `drawCard`
// re-points these to the brand's {display, label} for the duration of ONE
// synchronous draw and resets them after — so all ~30 references adopt the brand
// faces with no threading, and the display/label mapping can't drift because it
// is the exact same references. Mutable on purpose; only this module reads it,
// and a draw is synchronous so no external caller can observe the swap.
export const CARD_FONTS = {
  serif: DEFAULT_DISPLAY,
  sans: DEFAULT_LABEL,
};

// The brand pairing to draw with, resolved from the concept. Absent → defaults.
function resolveFonts(concept?: CardConcept): BrandFontPairing {
  const f = concept?.fonts;
  return {
    display: (f?.display || '').trim() || DEFAULT_DISPLAY,
    label: (f?.label || '').trim() || DEFAULT_LABEL,
  };
}

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

  const fontSizePx = W * CARD_TEXT_SCALE.eyebrow;
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

  const fontSizePx = W * CARD_TEXT_SCALE.logo;
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
    const refSizePx = W * CARD_TEXT_SCALE.compact;
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
    const sizePx = W * CARD_TEXT_SCALE.secondary;
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

    const cellFontSizePx = Math.max(W * CARD_TEXT_SCALE.compact, cellW * 0.13);

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
        W * 0.024,
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
    const sizePx = W * CARD_TEXT_SCALE.compact;
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

// ─── editorial ───────────────────────────────────────────────────────────
// A structured layout drawn OVER a photograph, rather than over a flat or
// gradient fill: wordmark + subtitle, a large serif headline, a rule,
// icon+text feature rows, and a footer band. The other three templates only
// ever draw on backgrounds this module fully controls (flat colors,
// gradients it built), so contrast is guaranteed by construction. A photo
// is a wildcard — exposure, color, and where the interesting part of the
// image sits are all unknown at draw time — so this template additionally
// needs a scrim (see `paintEditorialScrim`) that the others don't.

/**
 * Loads the editorial template's background photo ahead of drawing.
 *
 * Background loading is intentionally kept OUT of `drawCard` (which stays
 * fully synchronous, like every other template's draw path) so the exact
 * same synchronous routine can be shared by the full-resolution export and
 * the on-screen preview — only the entry points (`renderCardConcept`,
 * `renderCardPreviewDataUrl`) need to be async, to fetch the photo first and
 * hand the already-loaded `HTMLImageElement` in.
 *
 * Never rejects: a missing `backgroundUrl`, a broken URL, a network failure,
 * or a host that doesn't send CORS headers all resolve to `null` rather than
 * throwing, because a missing photo should degrade the editorial template to
 * its palette-gradient fallback (see `drawEditorial`), not fail the whole
 * card render. `crossOrigin = 'anonymous'` is required so the canvas isn't
 * "tainted" once the image is drawn onto it and `toBlob`/`toDataURL` would
 * otherwise throw — Supabase Storage public URLs already send permissive
 * CORS headers (this is relied on the same way in `imageComposite.ts`), so
 * in practice this only degrades for non-Supabase photo URLs, which is an
 * acceptable trade for keeping the export path from ever hard-failing.
 */
function loadCardBackgroundImage(url: string | undefined | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const src = safeText(url).trim();
    if (!src || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Draws `img` to fill the `W`x`H` region, cropping overflow rather than
 * stretching — CSS `background-size: cover` behavior, centered on both
 * axes — so the photo's proportions are never distorted regardless of its
 * native aspect ratio.
 */
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number): void {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return;

  const targetRatio = W / H;
  const sourceRatio = imgW / imgH;

  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;

  if (sourceRatio > targetRatio) {
    // Source is relatively wider than the card — crop the left/right edges,
    // keep the full height.
    sw = imgH * targetRatio;
    sx = (imgW - sw) / 2;
  } else {
    // Source is relatively taller than the card — crop top/bottom, keep the
    // full width.
    sh = imgW / targetRatio;
    sy = (imgH - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
}

/**
 * Washes the photo with `palette.bg1` so the layout on top stays legible.
 * This is what turns "text dumped on a picture" into "designed" — biased
 * toward the left/top where the text column and wordmark live, and eased
 * back over a lower-right "focal" zone (via a `destination-out` erase) so
 * the photo still reads as a photo instead of a flat wash. `strength`
 * (`concept.scrimStrength`, default ~0.72) is intentionally heavy: the
 * reference this template is built from washes the photo hard rather than
 * relying on a subtle vignette, because subtle doesn't survive arbitrary
 * source photos at feed-thumbnail size.
 */
function paintEditorialScrim(ctx: CanvasRenderingContext2D, palette: CardPalette, W: number, H: number, strength: number): void {
  const bg1 = palette?.bg1 || '#221f1a';
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0) return;

  ctx.save();

  // Left-heavy horizontal wash: strong under the text column, tapering off
  // toward the right edge of the frame.
  const horizontal = ctx.createLinearGradient(0, 0, W, 0);
  horizontal.addColorStop(0, hexToRgba(bg1, s));
  horizontal.addColorStop(0.65, hexToRgba(bg1, s * 0.55));
  horizontal.addColorStop(1, hexToRgba(bg1, s * 0.22));
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, W, H);

  // Extra wash over the top band, where the wordmark sits. This compounds
  // with the horizontal wash in the top-left corner, which is exactly where
  // the smallest, most delicate text (the tracked subtitle) needs the most
  // contrast help.
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  top.addColorStop(0, hexToRgba(bg1, s * 0.45));
  top.addColorStop(1, hexToRgba(bg1, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.4);

  // Erase some of the wash back out over the photo's focal area (lower-right
  // — clear of the left-aligned text column) so that part of the image stays
  // recognizable rather than being uniformly greyed out. `destination-out`
  // only uses the fill's alpha channel, so the color here is irrelevant.
  ctx.globalCompositeOperation = 'destination-out';
  const focal = ctx.createRadialGradient(W * 0.78, H * 0.62, 0, W * 0.78, H * 0.62, W * 0.55);
  focal.addColorStop(0, `rgba(0,0,0,${s * 0.5})`);
  focal.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = focal;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}

/** Solid-ish band anchored to the bottom edge so the footer's tracked caps
 * stay legible regardless of what's directly behind them in the photo. */
function paintFooterBand(ctx: CanvasRenderingContext2D, palette: CardPalette, W: number, H: number, bandTop: number): void {
  const bg1 = palette?.bg1 || '#221f1a';
  ctx.save();
  const gradient = ctx.createLinearGradient(0, bandTop, 0, H);
  gradient.addColorStop(0, hexToRgba(bg1, 0));
  gradient.addColorStop(0.4, hexToRgba(bg1, 0.82));
  gradient.addColorStop(1, hexToRgba(bg1, 0.92));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, bandTop, W, H - bandTop);
  ctx.restore();
}

interface BulletWord {
  text: string;
  bold: boolean;
}

/**
 * Splits `text` into words tagged bold/regular by whether they fall inside
 * the `emphasis` substring. A word that only partially overlaps the
 * emphasis range is tagged bold in full — splitting one word across two
 * font weights would read as a rendering glitch, not a design choice. If
 * `emphasis` is empty, or the substring isn't actually found in `text`
 * (author typo, emphasis drifted from the bullet copy on an edit), every
 * word comes back regular rather than throwing.
 */
function tagBulletWords(text: string, emphasis: string): BulletWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const trimmedEmphasis = emphasis.trim();
  if (!trimmedEmphasis) return words.map((w) => ({ text: w, bold: false }));

  const emphasisStart = text.indexOf(trimmedEmphasis);
  if (emphasisStart === -1) return words.map((w) => ({ text: w, bold: false }));
  const emphasisEnd = emphasisStart + trimmedEmphasis.length;

  let cursor = 0;
  return words.map((w) => {
    const start = text.indexOf(w, cursor);
    const end = start + w.length;
    cursor = end;
    const bold = start < emphasisEnd && end > emphasisStart;
    return { text: w, bold };
  });
}

/**
 * Word-wraps a bold/regular-tagged word stream, measuring each word at its
 * OWN weight. A bold run is wider than the same text set in regular weight,
 * so measuring everything in one font (the way the plain `wrapText` above
 * does for single-weight text) would under-count width and let bold lines
 * run past `maxWidth`.
 */
function wrapBulletWords(
  ctx: CanvasRenderingContext2D,
  words: BulletWord[],
  maxWidth: number,
  fontSizePx: number,
  family: string
): BulletWord[][] {
  if (words.length === 0) return [[]];

  const measureLine = (line: BulletWord[]): number => {
    let w = 0;
    line.forEach((word, i) => {
      ctx.font = fontString(word.bold ? 700 : 400, fontSizePx, family);
      w += ctx.measureText(word.text).width;
      if (i < line.length - 1) {
        ctx.font = fontString(400, fontSizePx, family);
        w += ctx.measureText(' ').width;
      }
    });
    return w;
  };

  const lines: BulletWord[][] = [];
  let currentLine: BulletWord[] = [words[0]];
  for (let i = 1; i < words.length; i++) {
    const candidate = [...currentLine, words[i]];
    if (measureLine(candidate) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = [words[i]];
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Draws one wrapped bullet line, switching font weight run-by-run (word by
 * word, advancing the cursor by each word's own measured width) so the
 * emphasised fragment sits bold INLINE with the rest of the sentence rather
 * than breaking onto its own line or needing a different color to stand out.
 */
function drawBulletLineRuns(
  ctx: CanvasRenderingContext2D,
  line: BulletWord[],
  x: number,
  y: number,
  fontSizePx: number,
  family: string,
  color: string
): void {
  let cursorX = x;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  line.forEach((word, i) => {
    ctx.font = fontString(word.bold ? 700 : 400, fontSizePx, family);
    ctx.fillText(word.text, cursorX, y);
    cursorX += ctx.measureText(word.text).width;
    if (i < line.length - 1) {
      ctx.font = fontString(400, fontSizePx, family);
      cursorX += ctx.measureText(' ').width;
    }
  });
}

/**
 * Draws a small circular badge with a simple geometric glyph for one
 * `CardBullet.icon`. Everything here is canvas paths — no icon font, no
 * external asset — so the icon renders identically regardless of what's
 * installed/loaded in the browser, same guarantee the rest of this file
 * gives for fonts. Glyphs are deliberately simple silhouettes: at the size
 * these badges render (a few dozen px in a feed thumbnail) fine detail would
 * just blur into noise.
 */
function drawBulletIcon(
  ctx: CanvasRenderingContext2D,
  icon: CardBullet['icon'] | undefined,
  cx: number,
  cy: number,
  radius: number,
  accent: string
): void {
  ctx.save();

  // Badge circle.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.14);
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.09);
  ctx.strokeStyle = accent;
  ctx.stroke();

  const s = radius * 0.55; // glyph half-extent, kept well inside the badge
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(1.5, radius * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (icon) {
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.75);
      ctx.bezierCurveTo(cx - s * 1.15, cy + s * 0.05, cx - s * 0.55, cy - s * 0.95, cx, cy - s * 0.25);
      ctx.bezierCurveTo(cx + s * 0.55, cy - s * 0.95, cx + s * 1.15, cy + s * 0.05, cx, cy + s * 0.75);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'book': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.5);
      ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 0.75, cx - s * 0.9, cy - s * 0.1);
      ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.55, cx, cy + s * 0.35);
      ctx.moveTo(cx, cy - s * 0.5);
      ctx.quadraticCurveTo(cx + s * 0.9, cy - s * 0.75, cx + s * 0.9, cy - s * 0.1);
      ctx.quadraticCurveTo(cx + s * 0.9, cy + s * 0.55, cx, cy + s * 0.35);
      ctx.stroke();
      break;
    }
    case 'leaf': {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.5, s * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.8);
      ctx.lineTo(0, s * 0.8);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, radius * 0.05);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'sparkle': {
      const r = s * 1.05;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'check': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.6, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.15, cy + s * 0.5);
      ctx.lineTo(cx + s * 0.65, cy - s * 0.5);
      ctx.stroke();
      break;
    }
    case 'sun': {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      const rays = 8;
      for (let i = 0; i < rays; i++) {
        const angle = (Math.PI * 2 * i) / rays;
        const x1 = cx + Math.cos(angle) * s * 0.65;
        const y1 = cy + Math.sin(angle) * s * 0.65;
        const x2 = cx + Math.cos(angle) * s * 0.95;
        const y2 = cy + Math.sin(angle) * s * 0.95;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      break;
    }
    default: {
      // No icon, or a value we don't recognize (e.g. concept came from an
      // older/different AI response shape) — fall back to a plain dot
      // rather than skipping the badge circle's purpose entirely.
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/**
 * Editorial template: the layout engine used by every other template, run
 * over a photograph instead of a flat/gradient fill. `backgroundImage` is
 * pre-loaded by the entry points (`renderCardConcept`/
 * `renderCardPreviewDataUrl`) via `loadCardBackgroundImage` — this function
 * stays synchronous like every other `draw*` function so `drawCard` doesn't
 * need a different calling convention per template.
 */
function drawEditorial(
  ctx: CanvasRenderingContext2D,
  concept: CardConcept,
  W: number,
  H: number,
  backgroundImage: HTMLImageElement | null
): void {
  const palette = concept.palette;
  const textColor = palette?.text || '#2c2a24';
  const accent = palette?.accent || '#a9713f';

  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, W, H);
  } else {
    // No photo — `backgroundUrl` was empty, or `loadCardBackgroundImage`
    // couldn't load it (network failure, bad URL, CORS). Degrade to the same
    // gradient fill the other templates use rather than leaving a blank
    // canvas or throwing; the layout below still draws on top unchanged, so
    // the card is still usable, just without the photo.
    paintBackground(ctx, palette, W, H, false);
  }

  const scrimStrength = typeof concept.scrimStrength === 'number' ? concept.scrimStrength : 0.72;
  paintEditorialScrim(ctx, palette, W, H, scrimStrength);

  const marginX = W * 0.09;
  // Match the generator's strict left-55% typography-safe zone. The old 60%
  // column reached past the center line and could overlap a correctly placed
  // face at the edge of the right-side subject area.
  const maxWidth = W * 0.5;

  // Footer band is sized first (independent of everything drawn above it) so
  // the headline's auto-shrink target below can reserve exactly the right
  // amount of room for it.
  const footer = safeText(concept.footer).trim();
  const footerBandH = footer ? H * 0.085 : 0;

  // Bullet rows are sized up front too, for the same reason — fixed-height
  // rows keep the reservation math simple; each row can still wrap its text
  // to two lines within that height.
  const bullets = Array.isArray(concept.bullets) ? concept.bullets.filter((b) => b && typeof b.text === 'string' && b.text.trim()) : [];
  const bulletRowH = H * 0.072;
  const bulletGap = H * 0.018;
  const bulletsBlockH = bullets.length > 0 ? bullets.length * bulletRowH + (bullets.length - 1) * bulletGap : 0;

  let cursorY = H * 0.09;

  // Wordmark + subtitle. Short by nature (a brand mark), so unlike the
  // headline below these are drawn as a single line rather than auto-shrunk
  // — matches how `drawLogoText` treats `logoText` elsewhere in this file.
  const wordmark = safeText(concept.wordmark).trim();
  if (wordmark) {
    const sizePx = W * 0.062;
    ctx.save();
    // Italic serif approximates the reference's script wordmark without
    // pulling in a new font family — the same trick `drawLogoText` already
    // uses for `logoText`, just larger.
    ctx.font = fontString(600, sizePx, CARD_FONTS.serif, true);
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(wordmark, marginX, cursorY + sizePx * 0.8);
    ctx.restore();
    cursorY += sizePx * 0.95;
  }

  const wordmarkSubtitle = safeText(concept.wordmarkSubtitle).trim();
  if (wordmarkSubtitle) {
    const sizePx = W * CARD_TEXT_SCALE.compact;
    ctx.save();
    ctx.font = fontString(600, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = accent;
    ctx.textBaseline = 'alphabetic';
    drawTracked(ctx, wordmarkSubtitle.toUpperCase(), marginX, cursorY + sizePx * 0.8, sizePx * 0.22, 'left');
    ctx.restore();
    cursorY += sizePx * 1.9;
  }

  cursorY += H * 0.025; // breathing room before the headline

  // The headline reuses the generic `heading` field (the same field the grid
  // template uses for its large heading line) — editorial doesn't get its
  // own dedicated headline field in the type contract, and `heading` already
  // means "the big serif line" elsewhere in this file.
  const headline = safeText(concept.heading).trim();

  const ruleReserve = H * 0.05; // rule stroke + the margins drawn around it
  const bulletsGapReserve = bullets.length > 0 ? H * 0.03 : 0;
  const reservedBelow = ruleReserve + bulletsBlockH + bulletsGapReserve + footerBandH + H * 0.02;
  const headlineMaxHeight = Math.max(H * 0.12, H - cursorY - reservedBelow);

  if (headline) {
    // fitTextBlock so a long headline shrinks to fit above the bullets
    // instead of colliding/overlapping with them.
    const fit = fitTextBlock(ctx, headline, maxWidth, headlineMaxHeight, W * 0.078, W * 0.04, W * 0.004, 1.08, (sizePx) => {
      ctx.font = fontString(600, sizePx, CARD_FONTS.serif);
    });
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let lineTop = cursorY;
    for (const line of fit.lines) {
      ctx.fillText(line, marginX, lineTop + fit.fontSizePx * 0.85);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + H * 0.015;
  } else {
    cursorY += headlineMaxHeight * 0.3;
  }

  // Short decorative rule.
  const ruleWidth = W * 0.12;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, W * 0.004);
  ctx.beginPath();
  ctx.moveTo(marginX, cursorY);
  ctx.lineTo(marginX + ruleWidth, cursorY);
  ctx.stroke();
  ctx.restore();
  cursorY += H * 0.035;

  // Bullet rows: icon badge + wrapped, mixed-weight text.
  if (bullets.length > 0) {
    const iconRadius = bulletRowH * 0.36;
    const textFontSizePx = W * CARD_TEXT_SCALE.secondary;
    const textX = marginX + iconRadius * 2 + W * 0.025;
    const bulletTextMaxWidth = Math.max(W * 0.15, maxWidth - (textX - marginX));

    for (const bullet of bullets) {
      const rowCenterY = cursorY + bulletRowH / 2;
      drawBulletIcon(ctx, bullet.icon, marginX + iconRadius, rowCenterY, iconRadius, accent);

      const words = tagBulletWords(safeText(bullet.text), safeText(bullet.emphasis));
      const lines = wrapBulletWords(ctx, words, bulletTextMaxWidth, textFontSizePx, CARD_FONTS.sans);
      const lineHeightPx = textFontSizePx * 1.25;
      const blockHeight = lines.length * lineHeightPx;
      let lineTop = rowCenterY - blockHeight / 2;
      for (const line of lines) {
        drawBulletLineRuns(ctx, line, textX, lineTop + textFontSizePx * 0.85, textFontSizePx, CARD_FONTS.sans, textColor);
        lineTop += lineHeightPx;
      }

      cursorY += bulletRowH + bulletGap;
    }
  }

  // Footer band: pinned to the bottom edge (computed from footerBandH, not
  // from cursorY) so it always sits flush with the bottom regardless of how
  // much room the content above actually used.
  if (footer) {
    const bandTop = H - footerBandH;
    paintFooterBand(ctx, palette, W, H, bandTop);

    const sizePx = W * CARD_TEXT_SCALE.compact;
    ctx.save();
    ctx.font = fontString(600, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'alphabetic';
    const footerY = bandTop + footerBandH / 2 + sizePx * 0.32;
    drawTracked(ctx, footer.toUpperCase(), marginX, footerY, sizePx * 0.2, 'left');
    ctx.restore();
  }

  // Deliberately NOT calling `drawLogoText` here: the wordmark + footer band
  // already carry the brand identity for this template, both anchored near
  // the same top/bottom edges `drawLogoText` targets, so adding it back
  // would either duplicate the wordmark or visually collide with the
  // footer band.
}

// ─── list ────────────────────────────────────────────────────────────────
// A numbered listicle: heading up top, then bullets rendered as vertical
// numbered rows (big accent numeral + text) rather than the grid's boxes or
// the editorial's icon badges — deliberately reuses the bold-emphasis
// machinery (`tagBulletWords`/`wrapBulletWords`/`drawBulletLineRuns`) built
// for editorial's bullet rows, just without the icon.

function drawList(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);

  const padX = W * 0.1;
  const maxWidth = W - padX * 2;

  let cursorY = H * 0.1;
  cursorY = drawEyebrow(ctx, concept.eyebrow, palette, W, cursorY);

  const heading = safeText(concept.heading).trim();
  if (heading) {
    const fit = fitTextBlock(ctx, heading, maxWidth, H * 0.14, W * 0.05, W * 0.032, W * 0.004, 1.15, (sizePx) => {
      ctx.font = fontString(600, sizePx, CARD_FONTS.serif);
    });
    ctx.fillStyle = palette?.text || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let lineTop = cursorY;
    for (const line of fit.lines) {
      ctx.fillText(line, W / 2, lineTop + fit.fontSizePx * 0.85);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.4;
  }

  const bullets = Array.isArray(concept.bullets) ? concept.bullets.filter((b) => b && typeof b.text === 'string' && b.text.trim()) : [];
  const footnote = safeText(concept.footnote).trim();

  // Reserve room below the list for the footnote + logo, same pattern as
  // `drawGrid`'s `reservedBottom`.
  const reservedBottom = (footnote ? H * 0.06 : 0) + H * 0.14;
  const listTop = cursorY + H * 0.02;
  const listBottom = H - reservedBottom;
  const listHeight = Math.max(H * 0.1, listBottom - listTop);

  if (bullets.length > 0) {
    // Items are spaced evenly: one fixed-height slot per bullet, rather than
    // packing tightly, so the list reads as calm rows regardless of count.
    const rowH = listHeight / bullets.length;
    const numberColW = W * 0.14;
    const textX = padX + numberColW;
    const textMaxWidth = Math.max(W * 0.2, maxWidth - numberColW);
    const rowPad = rowH * 0.12;
    const minFontSizePx = W * 0.024;

    bullets.forEach((bullet, i) => {
      const rowTop = listTop + i * rowH;
      const rowCenterY = rowTop + rowH / 2;

      // Large accent numeral, right-aligned against the text column's start
      // so digit count (1 vs 10) never shifts where the item text begins.
      const numberSizePx = Math.min(rowH * 0.55, W * 0.075);
      ctx.save();
      ctx.font = fontString(600, numberSizePx, CARD_FONTS.serif);
      ctx.fillStyle = palette?.accent || '#c9622a';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(i + 1), textX - W * 0.025, rowCenterY + numberSizePx * 0.32);
      ctx.restore();

      // Item text, honoring the bullet's inline emphasis fragment, shrunk to
      // fit its row slot (long items get smaller rather than overflowing
      // into the next row).
      const words = tagBulletWords(safeText(bullet.text), safeText(bullet.emphasis));
      const availableTextH = rowH - rowPad * 2;
      let textFontSizePx = Math.min(W * CARD_TEXT_SCALE.secondary, rowH * 0.4);
      let lines = wrapBulletWords(ctx, words, textMaxWidth, textFontSizePx, CARD_FONTS.sans);
      let lineHeightPx = textFontSizePx * 1.28;
      while (lines.length * lineHeightPx > availableTextH && textFontSizePx > minFontSizePx) {
        textFontSizePx = Math.max(minFontSizePx, textFontSizePx - W * 0.002);
        lines = wrapBulletWords(ctx, words, textMaxWidth, textFontSizePx, CARD_FONTS.sans);
        lineHeightPx = textFontSizePx * 1.28;
      }

      const blockHeight = lines.length * lineHeightPx;
      let lineTop = rowCenterY - blockHeight / 2;
      for (const line of lines) {
        drawBulletLineRuns(ctx, line, textX, lineTop + textFontSizePx * 0.85, textFontSizePx, CARD_FONTS.sans, palette?.text || '#ffffff');
        lineTop += lineHeightPx;
      }
    });

    cursorY = listTop + listHeight;
  } else {
    cursorY = listTop;
  }

  if (footnote) {
    const sizePx = W * CARD_TEXT_SCALE.compact;
    ctx.save();
    ctx.font = fontString(400, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#999999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, footnote, maxWidth);
    let y = Math.max(cursorY + sizePx * 1.4, listBottom - (wrapped.length - 1) * sizePx * 1.4);
    for (const line of wrapped) {
      ctx.fillText(line, W / 2, y);
      y += sizePx * 1.4;
    }
    ctx.restore();
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── conversation ────────────────────────────────────────────────────────
// Text-message bubbles: 'left' messages hug the left edge in a muted/neutral
// tint (mirrors the grid's non-highlighted cell treatment), 'right' messages
// hug the right edge filled with the accent color.

/**
 * Picks a readable text color to sit on top of `hex` — `light` (typically
 * white) for a dark/saturated background, `dark` (typically `palette.bg1`)
 * for a light/pale one. Only used for the accent-filled bubble in
 * `drawConversation`, where the accent color is author-controlled and could
 * land anywhere from a pale mint to a deep navy. Falls back to `light` on an
 * unparseable color rather than guessing.
 */
function contrastTextColor(hex: string, light: string, dark: string): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((hex || '').trim());
  if (!match) return light;
  const digits = match[1];
  const full = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? dark : light;
}

function drawConversation(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);

  const padX = W * 0.08;
  const maxWidth = W - padX * 2;

  let cursorY = H * 0.1;
  cursorY = drawEyebrow(ctx, concept.eyebrow, palette, W, cursorY);

  const heading = safeText(concept.heading).trim();
  if (heading) {
    const fit = fitTextBlock(ctx, heading, maxWidth, H * 0.1, W * 0.045, W * 0.03, W * 0.003, 1.15, (sizePx) => {
      ctx.font = fontString(600, sizePx, CARD_FONTS.serif);
    });
    ctx.fillStyle = palette?.text || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let lineTop = cursorY;
    for (const line of fit.lines) {
      ctx.fillText(line, W / 2, lineTop + fit.fontSizePx * 0.85);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.5;
  }

  const messages = Array.isArray(concept.messages)
    ? concept.messages.filter((m) => m && typeof m.text === 'string' && m.text.trim() && (m.side === 'left' || m.side === 'right'))
    : [];

  const reservedBottom = H * 0.14;
  const areaTop = cursorY + H * 0.02;
  const areaBottom = H - reservedBottom;
  const areaHeight = Math.max(H * 0.1, areaBottom - areaTop);

  if (messages.length > 0) {
    const bubbleMaxWidth = maxWidth * 0.68;
    const bubbleFontSizePx = W * CARD_TEXT_SCALE.secondary;
    const bubblePadX = W * 0.032;
    const bubblePadY = H * 0.02;
    const lineHeightPx = bubbleFontSizePx * 1.3;
    const gap = H * 0.02;

    ctx.font = fontString(400, bubbleFontSizePx, CARD_FONTS.sans);
    const textInnerWidth = bubbleMaxWidth - bubblePadX * 2;

    // Pre-measure every bubble's wrapped lines/height so the whole stack can
    // be vertically centered in the available area — the same "center the
    // block" treatment the other templates give their main content.
    const laidOut = messages.map((m) => {
      const lines = wrapText(ctx, safeText(m.text).trim(), textInnerWidth);
      const bubbleH = lines.length * lineHeightPx + bubblePadY * 2;
      return { side: m.side, lines, bubbleH };
    });
    const totalHeight = laidOut.reduce((sum, m) => sum + m.bubbleH, 0) + gap * Math.max(0, laidOut.length - 1);

    // If the stack is taller than the area (many/long messages), clamp to
    // the top of the area instead of a negative offset — later bubbles may
    // then run close to the logo, the same floor-size trade-off the other
    // auto-fit blocks make rather than throwing or truncating messages.
    const y0 = Math.max(areaTop, areaTop + (areaHeight - totalHeight) / 2);
    let y = y0;

    for (const bubble of laidOut) {
      const isRight = bubble.side === 'right';
      let bubbleTextWidth = 0;
      for (const line of bubble.lines) {
        bubbleTextWidth = Math.max(bubbleTextWidth, ctx.measureText(line).width);
      }
      const bubbleW = Math.min(bubbleMaxWidth, bubbleTextWidth + bubblePadX * 2);
      const x = isRight ? W - padX - bubbleW : padX;

      ctx.save();
      roundedRectPath(ctx, x, y, bubbleW, bubble.bubbleH, Math.min(bubbleW, bubble.bubbleH) * 0.22);
      if (isRight) {
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

      ctx.save();
      ctx.font = fontString(400, bubbleFontSizePx, CARD_FONTS.sans);
      ctx.fillStyle = isRight
        ? contrastTextColor(palette?.accent || '#c9622a', '#ffffff', palette?.bg1 || '#111111')
        : palette?.text || '#ffffff';
      ctx.textAlign = isRight ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      const textX = isRight ? x + bubbleW - bubblePadX : x + bubblePadX;
      let lineY = y + bubblePadY + bubbleFontSizePx * 0.85;
      for (const line of bubble.lines) {
        ctx.fillText(line, textX, lineY);
        lineY += lineHeightPx;
      }
      ctx.restore();

      y += bubble.bubbleH + gap;
    }
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── stat ────────────────────────────────────────────────────────────────
// One oversized figure: a huge serif value dominates the card, a small
// tracked unit label sits directly under it, and a muted context line closes
// it out — scroll-stopping by construction rather than by decoration.

function drawStat(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);
  paintAccentGlow(ctx, palette?.accent, W, H);

  const padX = W * 0.1;
  const maxWidth = W - padX * 2;

  let topY = H * 0.12;
  topY = drawEyebrow(ctx, concept.eyebrow, palette, W, topY);

  const statValue = safeText(concept.statValue).trim();
  const statUnit = safeText(concept.statUnit).trim();
  const subline = safeText(concept.subline).trim();

  const reservedBelow = (statUnit ? H * 0.05 : 0) + (subline ? H * 0.08 : 0) + H * 0.16;
  const maxBlockHeight = Math.max(H * 0.18, H - topY - reservedBelow);

  let cursorY = topY;

  if (statValue) {
    const fit = fitTextBlock(ctx, statValue, maxWidth, maxBlockHeight, W * 0.34, W * 0.12, W * 0.008, 1.05, (sizePx) => {
      ctx.font = fontString(600, sizePx, CARD_FONTS.serif);
    });

    ctx.fillStyle = palette?.text || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const blockHeight = fit.lines.length * fit.lineHeightPx;
    let lineTop = cursorY + Math.max(0, (maxBlockHeight - blockHeight) / 2);
    for (const line of fit.lines) {
      ctx.fillText(line, W / 2, lineTop + fit.fontSizePx * 0.85);
      lineTop += fit.lineHeightPx;
    }
    cursorY = lineTop + fit.fontSizePx * 0.1;
  } else {
    cursorY += maxBlockHeight * 0.5;
  }

  if (statUnit) {
    const sizePx = W * CARD_TEXT_SCALE.secondary;
    ctx.save();
    ctx.font = fontString(600, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.accent || '#c9622a';
    ctx.textBaseline = 'alphabetic';
    cursorY += sizePx * 0.6;
    drawTracked(ctx, statUnit.toUpperCase(), W / 2, cursorY, sizePx * 0.2, 'center');
    ctx.restore();
    cursorY += sizePx * 1.2;
  }

  if (subline) {
    const sizePx = W * CARD_TEXT_SCALE.secondary;
    ctx.save();
    ctx.font = fontString(400, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#999999';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const wrapped = wrapText(ctx, subline, maxWidth * 0.85);
    let y = cursorY + sizePx * 1.6;
    for (const line of wrapped) {
      ctx.fillText(line, W / 2, y);
      y += sizePx * 1.4;
    }
    ctx.restore();
  }

  drawLogoText(ctx, concept.logoText, palette, W, H);
}

// ─── quote ───────────────────────────────────────────────────────────────
// A framed pull-quote: a large low-opacity opening quotation mark anchors
// the top-left of the block, the quotation itself reuses `statement` (with
// inline emphasis honored via the same word-run machinery editorial's
// bullets use), and a small tracked attribution line closes it — distinct
// from `drawStatement`'s centered, mark-free treatment.

function drawQuote(ctx: CanvasRenderingContext2D, concept: CardConcept, W: number, H: number): void {
  const palette = concept.palette;
  paintBackground(ctx, palette, W, H, false);

  const padX = W * 0.1;
  const maxWidth = W - padX * 2;

  let topY = H * 0.1;
  topY = drawEyebrow(ctx, concept.eyebrow, palette, W, topY);

  const statement = safeText(concept.statement).trim();
  const emphasis = safeText(concept.statementEmphasis).trim();
  const attribution = safeText(concept.attribution).trim();

  let quoteTop = topY;
  if (statement) {
    // Decorative opening mark — only drawn when there's actually a
    // quotation to frame, so an empty concept doesn't leave a lonely glyph.
    const markSizePx = W * 0.26;
    ctx.save();
    ctx.font = fontString(700, markSizePx, CARD_FONTS.serif);
    ctx.fillStyle = hexToRgba(palette?.accent || '#c9622a', 0.32);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('“', padX - markSizePx * 0.06, topY + markSizePx * 0.72);
    ctx.restore();
    quoteTop = topY + markSizePx * 0.58;
  }

  const reservedBelow = (attribution ? H * 0.07 : 0) + H * 0.16;
  const maxBlockHeight = Math.max(H * 0.18, H - quoteTop - reservedBelow);

  let cursorY = quoteTop;

  if (statement) {
    const words = tagBulletWords(statement, emphasis);
    const minFontSizePx = W * 0.036;
    const lineHeightMultiplier = 1.18;
    let fontSizePx = W * 0.062;
    let lines = wrapBulletWords(ctx, words, maxWidth, fontSizePx, CARD_FONTS.serif);
    let lineHeightPx = fontSizePx * lineHeightMultiplier;
    while (lines.length * lineHeightPx > maxBlockHeight && fontSizePx > minFontSizePx) {
      fontSizePx = Math.max(minFontSizePx, fontSizePx - W * 0.003);
      lines = wrapBulletWords(ctx, words, maxWidth, fontSizePx, CARD_FONTS.serif);
      lineHeightPx = fontSizePx * lineHeightMultiplier;
    }

    const blockHeight = lines.length * lineHeightPx;
    let lineTop = cursorY + Math.max(0, (maxBlockHeight - blockHeight) / 2);
    for (const line of lines) {
      drawBulletLineRuns(ctx, line, padX, lineTop + fontSizePx * 0.85, fontSizePx, CARD_FONTS.serif, palette?.text || '#ffffff');
      lineTop += lineHeightPx;
    }
    cursorY = lineTop + fontSizePx * 0.2;
  } else {
    cursorY += maxBlockHeight * 0.5;
  }

  if (attribution) {
    const sizePx = W * CARD_TEXT_SCALE.compact;
    ctx.save();
    ctx.font = fontString(600, sizePx, CARD_FONTS.sans);
    ctx.fillStyle = palette?.muted || '#999999';
    ctx.textBaseline = 'alphabetic';
    drawTracked(ctx, attribution.toUpperCase(), padX, cursorY + sizePx * 1.6, sizePx * 0.16, 'left');
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
 *
 * `preloadedBackground` is only consulted for the `editorial` template, and
 * only exists because that template needs an async-loaded photo — see
 * `loadCardBackgroundImage`'s comment for why loading isn't done in here.
 * Callers that don't pass it (or pass `null`/`undefined`) just get the
 * editorial template's palette-gradient fallback instead of the photo.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  concept: CardConcept,
  W: number,
  H: number,
  preloadedBackground?: HTMLImageElement | null
): void {
  const template: CardTemplate =
    concept?.template === 'statement' ||
    concept?.template === 'grid' ||
    concept?.template === 'editorial' ||
    concept?.template === 'list' ||
    concept?.template === 'conversation' ||
    concept?.template === 'stat' ||
    concept?.template === 'quote'
      ? concept.template
      : 'verse';

  // Point the two font roles at this concept's brand pairing for the duration
  // of the draw, then restore. Synchronous, so no other caller can observe it.
  const fonts = resolveFonts(concept);
  const prevSerif = CARD_FONTS.serif;
  const prevSans = CARD_FONTS.sans;
  CARD_FONTS.serif = fonts.display;
  CARD_FONTS.sans = fonts.label;

  try {
    switch (template) {
      case 'statement':
        drawStatement(ctx, concept, W, H);
        break;
      case 'grid':
        drawGrid(ctx, concept, W, H);
        break;
      case 'editorial':
        drawEditorial(ctx, concept, W, H, preloadedBackground ?? null);
        break;
      case 'list':
        drawList(ctx, concept, W, H);
        break;
      case 'conversation':
        drawConversation(ctx, concept, W, H);
        break;
      case 'stat':
        drawStat(ctx, concept, W, H);
        break;
      case 'quote':
        drawQuote(ctx, concept, W, H);
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
  } finally {
    // Always restore the default roles, even if a renderer threw above.
    CARD_FONTS.serif = prevSerif;
    CARD_FONTS.sans = prevSans;
  }
}

async function loadFontsForConcept(concept?: CardConcept): Promise<void> {
  // Fonts must be awaited BEFORE any ctx.measureText/fillText call, because
  // ctx.font accepts an unloaded family without error — the browser just
  // renders (and measures) with its fallback font until the real one
  // finishes loading. If we measured/wrapped text before the swap, the
  // wrap decisions and auto-shrink sizing would be computed against the
  // wrong metrics and could visibly reflow once the real font pops in.
  // Sans weight 700 is used by editorial's and list's bold emphasis runs
  // (see `drawBulletLineRuns`); serif 400/700 are the same run machinery
  // reused by `drawQuote` for its inline-emphasised quotation. All loaded
  // here alongside the rest rather than conditionally per-template so every
  // template shares one font-loading path — the cost of a couple extra
  // weight fetches is trivial next to the risk of a template-specific loader
  // drifting out of sync.
  // Load the CONCEPT's actual faces, not the hardcoded default pair — otherwise
  // a brand introducing a new family (Rekkrd's JetBrains Mono labels) never gets
  // fetched and canvas silently falls back to a system font, the exact failure
  // this file's header warns about. ensureFontLoaded injects a Google Fonts link
  // for any family and dedupes per family, so a brand's mono loads on first use.
  const { display, label } = resolveFonts(concept);
  await Promise.all([
    ensureFontLoaded(display, 300),
    ensureFontLoaded(display, 400),
    ensureFontLoaded(display, 600),
    ensureFontLoaded(display, 700),
    ensureFontLoaded(label, 400),
    ensureFontLoaded(label, 500),
    ensureFontLoaded(label, 600),
    ensureFontLoaded(label, 700),
  ]);
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
  // Fonts and (for editorial) the background photo both need to be ready
  // BEFORE drawCard runs, since drawCard itself is synchronous — load them
  // in parallel since neither depends on the other.
  const [, backgroundImage] = await Promise.all([
    loadFontsForConcept(concept),
    concept?.template === 'editorial' ? loadCardBackgroundImage(concept.backgroundUrl) : Promise.resolve(null),
  ]);

  const { canvas, ctx } = createCardCanvas(scale);
  drawCard(ctx, concept, CARD_SIZE.width, CARD_SIZE.height, backgroundImage);

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
  const [, backgroundImage] = await Promise.all([
    loadFontsForConcept(concept),
    concept?.template === 'editorial' ? loadCardBackgroundImage(concept.backgroundUrl) : Promise.resolve(null),
  ]);

  const { canvas, ctx } = createCardCanvas(PREVIEW_SCALE);
  drawCard(ctx, concept, CARD_SIZE.width, CARD_SIZE.height, backgroundImage);

  return canvas.toDataURL('image/png');
}

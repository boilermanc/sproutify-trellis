// ─── Per-render text auto-fit ────────────────────────────────────────
// Templates render at a fixed 1080x1920, but the script text they carry is
// any length. Instead of a hardcoded font size (which makes long lines
// overflow and short lines look timid), each render measures its own text
// and picks the largest size that fits its width AND height budget, walking
// down from a ceiling to a floor. Measurement uses a canvas 2D context —
// available in the headless Chromium the render worker runs in, and
// consistent with how the DOM lays the same font stack out.

let _canvas: HTMLCanvasElement | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!_canvas) _canvas = document.createElement('canvas');
  const ctx = _canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context for text measurement');
  return ctx;
}

export interface FitOptions {
  text: string;
  maxWidth: number;       // px available for text (container width minus padding)
  maxHeight: number;      // px budget the wrapped block must fit inside
  maxFontSize: number;    // ceiling — never render larger than this
  minFontSize: number;    // floor — never render smaller than this
  fontFamily: string;     // same stack the template renders with
  fontWeight: number;
  lineHeight: number;     // multiplier (e.g. 1.25)
  letterSpacingPx?: number;
  // Extra horizontal gap between words beyond the natural glyphs. For plain
  // flowing text this is the space width (default). For templates that render
  // each word as an inline-block with marginRight, pass that margin instead
  // (there is no space character between the spans).
  wordGapPx?: number;
}

export interface FitResult {
  fontSize: number;
  lineCount: number;
}

function lineCountAt(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
  gapPx: number,
): number {
  if (words.length === 0) return 0;
  let lines = 1;
  let lineWidth = 0;
  for (const word of words) {
    const w = ctx.measureText(word).width;
    if (lineWidth === 0) {
      // First word on a line always goes on, even if it alone exceeds width.
      lineWidth = w + gapPx;
    } else if (lineWidth + w <= maxWidth) {
      lineWidth += w + gapPx;
    } else {
      lines += 1;
      lineWidth = w + gapPx;
    }
  }
  return lines;
}

/**
 * Largest font size (from maxFontSize down to minFontSize) whose wrapped block
 * fits within maxHeight. Returns minFontSize if nothing fits — better a
 * slightly-cramped legible size than an overflow.
 */
export function fitText(opts: FitOptions): FitResult {
  const {
    text, maxWidth, maxHeight, maxFontSize, minFontSize,
    fontFamily, fontWeight, lineHeight, letterSpacingPx = 0,
  } = opts;
  const words = (text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return { fontSize: maxFontSize, lineCount: 0 };

  const ctx = measureCtx();
  // ctx.letterSpacing is honored by Chromium's canvas; harmless where absent.
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacingPx}px`; } catch { /* ignore */ }

  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    const gap = opts.wordGapPx ?? ctx.measureText(' ').width;
    const lines = lineCountAt(ctx, words, maxWidth, gap);
    const blockHeight = lines * size * lineHeight;
    if (blockHeight <= maxHeight || size <= minFontSize) {
      return { fontSize: size, lineCount: lines };
    }
  }
  return { fontSize: minFontSize, lineCount: 1 };
}

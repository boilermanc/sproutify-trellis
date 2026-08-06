# Clip Render Worker — Remotion conventions (for Claude Code)

Guidance for anyone (human or AI) editing this worker's Remotion code. It adapts
the general Remotion best-practices to THIS project's architecture. Read it
before touching `remotion/`.

## Architecture (read first — it changes the advice)

- **We render one MP4 PER BEAT, then ffmpeg-concats them** (`worker.mjs`:
  `renderBeat` → per-beat mp4 in `clip-assets/…/beats/`, then `assemble` concats
  to `final.mp4`). We do **not** render the whole short as a single composition.
  So **`<Series>` / `<TransitionSeries>` do not apply** to stitching here — beats
  are independent renders so they can be triaged/kept individually. Cross-beat
  transitions belong at the ffmpeg stage (xfade), not in a Remotion composition.
- There is ONE Remotion composition, `ClipBeat` (`remotion/Root.tsx`), rendered
  once per beat with `inputProps = { beatType, params, durationSec }`.
- Two render paths in the `ClipBeat` dispatcher (`remotion/Templates.tsx`):
  1. **Fixed templates** — the 7 `template_params`-driven layouts.
  2. **Freeform** — `beatType === 'freeform'` renders `FreeformScene` from a
     declarative **scene spec** (`params.scene`). This is the primary path.
- Freeform is a **DSL interpreter**, not hand-authored cards: the AI emits a
  `ClipScene` (see `FreeformScene.tsx`), and the renderer draws it. New visual
  capability = a new element type / field in `FreeformScene` + the matching
  entry in `types.ts` (frontend mirror) + `coerceScene` + the generator prompt
  (`services/clipService.ts` `sceneDslBlock`). Keep those four in sync.

## Animation rules (non-negotiable)

- **Deterministic only.** Drive everything from `useCurrentFrame()` /
  `useVideoConfig()`. **No CSS transitions, no `Math.random()`, no
  `Date.now()`** — they break frame-accurate rendering. (Bokeh uses a fixed
  per-index seed for this reason.)
- **`spring()` + `interpolate()`** is the default. Two drivers convention in
  `FreeformScene`'s `useEnter`: `s` (damping 200, smooth — slides/fades) and
  `sb` (mass 0.7 / stiffness 120 / damping 11, underdamped — `pop`/`bounce`
  overshoot). Reach for `sb` when you want energy, `s` when you want calm.
- **Clamp bounded values.** Use `extrapolateLeft/Right: 'clamp'` on opacity and
  anything that must not overshoot its range; the renderer also `clamp()`s every
  DSL field so a bad value degrades gracefully instead of throwing.
- Continuous life comes from `useLoop` (breathe/float/pulse/spin/sway) and the
  scene-level `useCamera` (push/pull/drift) — prefer these over static frames.

## Robustness (no blank/flickering frames)

- The renderer must **never throw on bad input**. Every element field is
  clamped/defaulted; unknown element types are skipped; a scene with no text
  gets a synthesized headline (`coerceScene`). Preserve this — the AI's output
  is not trusted to be well-formed.
- **Assets:** if you ever add images/video, use Remotion's `<Img>` / `<Video>`
  (not raw `<img>`) so the renderer waits for load. Today freeform uses no
  external assets — all visuals are CSS gradients/shapes, which is why there's
  no flicker and no `delayRender` needed.
- **Fonts:** currently the brand font resolves to an Inter/system stack (all
  brands are Inter today). If a brand ever needs a real webfont, load it via
  `@remotion/google-fonts` and gate the render with `delayRender()` /
  `continueRender()` — do NOT fetch a font ad hoc, it will flicker.

## Parameterization

- Keep `defaultProps` on the `ClipBeat` composition valid so `npm run studio`
  previews without a live job. When adding a scene field, give it a sane default
  in the renderer so old scenes (without the field) still render.

## Advanced (when asked)

- `interpolateColors()` — already used for the highlight sweep; use it for any
  color transition (never lerp hex by hand).
- `@remotion/paths` `evolvePath()` — for drawn-path motifs (logo draw, animated
  strokes) if we add them.

# Clip Studio — Short-Form Video Generator (SCOPE DRAFT v0.3)

> Status: DRAFT — based on 12 reference screenshots of the target app.
> Still pending: the Runs tab. Update this doc as more arrive.

---

## What We're Building

A Trellis module that turns **source material** (URLs, pasted text, transcript/subtitle
files) into a **publish-ready YouTube Short**:

1. **Create** — Feed sources (URLs / pasted text / PDF, TXT, MD, CSV, SRT, VTT, JSON),
   optionally steer the angle, pick a target length (30–150s) and format (Interview,
   Promotion with sponsor + talking points), pick the model.
2. **Script Lab** — AI writes a script in your voice as an "Interview Cut Sheet": your
   A-roll lines (RECORD THIS) interleaved with verbatim SOT quotes, following a learned
   hook/stakes/mechanism formula. Sidecar panels: **Fact Check** (verify-before-recording
   checklist), **Receipts** (claim + verbatim source excerpt pairs), **Script Versions**
   (history), **Hook Lab** (alternative hooks labeled by formula type). Revision loop:
   **Give Feedback → Revise Script** (talk to it like a writer on your team; each
   revision saved as a new version). Built-in **Teleprompter** + Export Doc.
   **Approve** gates the B-roll phase.
3. **B-roll Lab** — After script approval: for each script beat, AI writes a detailed
   **Remotion direction prompt** (vertical 9:16 motion graphic). A render worker turns
   each prompt into an MP4 with QA (typecheck, resolution/fps probe, preview stills).
   User triages: Keep / Reject / Winner / Made-the-edit. Complementary real-footage
   prompts (Seedance/Veo lane) per beat.
4. **Library** — All scripts with status, versions, model, sources, B-roll render
   progress, token + dollar cost, star rating, Set Production / Archive.
5. **Assemble + Publish** — Download kept clips (or auto-stitch), then publish through
   the existing Episode publish rail (E4 → YouTube).

### Reference App Anatomy (from screenshots)

**Create a Short form:**
- 01 SOURCES: URL(s) one per line · Copied text paste area · file dropzone
  (PDF, TXT, MD, CSV, SRT, VTT, JSON). "Add at least one source" validation.
- 02 STEERING: free-text direction ("Focus on the privacy implications, skip the
  pricing details") · Target length picker: 30s / 60s / 90s / 120s / 150s.
- 03 FORMAT: checkboxes — Promotion (reveals Sponsor/product + Talking points fields)
  and Interview.
- 04 ENGINE: model dropdown, multi-provider (reference shows OpenAI + Anthropic models).

**Script project page:**
- Header: back-to-Library, status chips (rendered / interview), title, stats line
  ("232 words · ~93s · anthropic/claude-fable-5 · 59,928 tokens · $1.60"), 5-star rating.
- Tabs: **Script · B-roll · Runs**.
- Action bar: "Regenerate with" model dropdown · Regenerate Script · **Approve**
  (approval unlocks B-roll — "receipts attached, B-roll after approval").
- **Generation N** block: model badge, word count · read time · target, Export Doc /
  **Teleprompter** / Edit. Cut-sheet body: YOU (RECORD THIS) A-roll blocks +
  speaker-attributed verbatim quote blocks, each with per-cut rationale (what was
  trimmed and why, risk flags).
- **Script Versions** panel: v1, v2… with model + timestamp + read time, "Current" marker.
- **Fact Check** panel ("verify before recording"): claims to verify / soften / omit —
  misheard product names, single-source claims, off-the-cuff numbers, forward-looking
  statements to frame as predictions, hypotheticals not to present as shipped product.
- **Receipts** rail: S1/S2… cards, each a claim paraphrase + the exact verbatim
  transcript quote backing it, speaker-labeled; header card describes the source file.
- **Learned Formula** panel: the structural recipe (hook lands in sentence one with a
  concrete consequence; concrete everyday scenario makes the mechanism tangible; creator
  A-roll is connective tissue only; ends with a curiosity loop + follow CTA).
- **Give Feedback** panel: free-text ("Lean harder into the privacy angle. Cut the
  pricing detail…") → **Revise Script**; keeps formula/hook/length on target; "Saved as
  a new version — the current one stays in history."
- **Hook Lab** panel: alternative openers, each labeled with its formula archetype —
  `question · Naive Question to Mechanism`, `stakes · News Event to Stakes`,
  `before-after` (concrete scenario), `secret-cost`, etc.

**B-roll tab:**
- Beat cards — timestamp range, beat-type tag, script line as headline, rationale,
  editable Remotion prompt, Generate / Reprompt + Generate, render record (QA passed ·
  6.0s · 1080x1920) with chips (typecheck passed, composition inspected 30fps/180
  frames, stills rendered, render passed, ffprobe verified), artifact links (Brief /
  Notes / Manifest / Contact sheet), triage buttons (Keep / Reject / Made the edit /
  Winner).
- Top-level: prompt-model selector, Download All, Generate All, filter chips
  (all / rendered / kept / undecided / failed), Render Queue with running/queued/done/
  failed counts, keyboard triage (J / shift+K prev-next, K keep, X reject, W winner).
- Beat types observed: motion graphic, kinetic quote card, animation, ui callout,
  timeline, source receipt card, text highlight.
- Per-beat "Complementary Footage Prompts": Seedance/Veo prompts for the real-footage
  lane — things motion graphics can't fake (chip fabs, phone-in-hand, reactions).

**Script Library:**
- KPI cards: Active scripts · In production · Archived · Known cost ($).
- Search, All active / In Production view toggle, sort by last updated,
  Active / Archive tabs.
- Script cards: status chips (draft / rendered / interview / open), title + hook line,
  MODEL, VERSIONS, SOURCES (count + type), B-ROLL progress (9/9 rendered), TOKENS,
  COST ($), 5-star rating, Open / Set Production / Archive.

**Runs tab:** not yet seen.

---

## Where It Fits in Trellis

**Decision: new top-level page `pages/ClipStudio.tsx` (route `clip-studio`), sibling to
Trellis Studio (music) and Trellis Episodes (long-form), in the content-production cluster.**

Why not the alternatives:
- **Inside Trellis Episodes** — Episodes are music-first (music → master → artwork →
  video → metadata → publish). Clips are script-first with a fan-out render queue; forcing
  them into the episode phase rail would distort both. But clips should *link* to an
  episode (a Short promoting an episode) and reuse its publish infra.
- **Social Hub** — content-only by design (copy + scheduling, no heavy media pipeline).
  Finished clips can surface there as attachable assets later.
- **Video Ad Lab** — ad-template oriented, spoke-data driven. Different job. (But the
  Promotion format with sponsor + talking points overlaps conceptually — a Trellis clip
  can promote a branch/product, pulling talking points from Brand DNA.)

Note the reference app's **Approve → B-roll** gate matches the Episodes pipeline's
review-gate pattern exactly — same UX philosophy, reuse the visual language.

### Reuse Map (Trellis equivalents of the reference app's stack)

| Reference app | Trellis equivalent |
|---|---|
| Multi-provider model picker (GPT-5.5, Claude Fable 5) | Gemini first (`gemini-3-flash-preview`); provider-agnostic `LlmProvider` architecture already planned |
| URL sources | Existing server-side page-scrape pattern (brand extraction edge fn) |
| Fact Check panel | Gemini + Google Search grounding (already used for brand extraction) |
| Give Feedback → Revise Script | Same Gemini call with prior generation + feedback; new `clip_generations` row |
| Local Codex CLI + Remotion render | `workers/` worker pattern (like `video_worker.py`) — a **Remotion render worker** (Node, since Remotion is React) polling a Hub job table |
| Render queue / Runs | `clip_render_jobs` table + polling (no Realtime, per gotchas) |
| Download All / assembly | `episode-assets` bucket pattern → new `clip-assets` bucket |
| Publish | Existing E4 episode-publish rail (YouTube OAuth already live); fulfills the "Social Clips" coming-soon publish target |
| Receipts (source files) | Storage upload + rows in `clip_sources` |
| Token/cost tracking | Store usage metadata per generation in `clip_generations` |

---

## Data Model (Hub Supabase — all per project conventions: UUID pk, TIMESTAMPTZ, RLS, CHECK not ENUM, IF NOT EXISTS)

- `clip_projects` — id, branch, episode_id (nullable FK to trellis_episodes), title,
  hook_line, status CHECK (`draft` | `scripting` | `approved` | `broll` | `production` |
  `publishing` | `published` | `archived`), format JSONB (interview/promotion + sponsor +
  talking_points), steering TEXT, target_seconds INT, rating SMALLINT,
  learned_formula JSONB, created_by, timestamps.
- `clip_sources` — project_id, kind CHECK (`url` | `pasted_text` | `file`), storage_path,
  url, raw_text, speaker_labels JSONB, label (S1, S2…).
- `clip_generations` — project_id, version INT, model TEXT, script JSONB (ordered beats),
  fact_checks JSONB, hook_alternatives JSONB (Hook Lab), feedback_prompt TEXT (what the
  user asked for, null for v1), word_count INT, est_seconds INT, tokens_used INT,
  cost_usd NUMERIC, is_current BOOLEAN.
- `clip_script_beats` — generation_id, position, lane CHECK (`aroll` | `sot`), text,
  rationale, speaker, source_id (receipt link).
- `clip_broll_beats` — project_id, script_beat_id, time_start/time_end, beat_type CHECK
  (7 observed types), remotion_prompt, footage_prompts JSONB (Seedance/Veo lane),
  triage CHECK (`undecided` | `kept` | `rejected` | `winner` | `edited`).
- `clip_render_jobs` — broll_beat_id, status CHECK (`queued` | `running` | `completed` |
  `failed`), qa JSONB (typecheck, probe, stills), output_path, duration_s, width, height,
  error, attempts.
- `clip_publications` — reuse/extend `trellis_episode_publications` pattern for
  YouTube Shorts.

Storage: `clip-assets` bucket (sources, rendered MP4s, contact sheets, stills).

---

## Phased Delivery

### Phase C1 — Create + Script Lab (frontend + Gemini, no workers) — ✅ BUILT 2026-07-03
Shipped: `pages/ClipStudio.tsx`, `services/clipService.ts`, Clip types in `types.ts`,
SQL_SCHEMA section 19 + migration applied to Hub (`trellis_clip_projects/_sources/_generations`),
route `clip-studio` + sidebar entry. Decisions locked: Gemini-only engine (picker deferred),
Remotion rendering in C3 (templates-first for the 7 beat types).
- New page + route + sidebar entry; **Script Library** list view + Create-a-Short form
  (sources: URL / paste / file upload; steering; target length; format; branch selector —
  the Trellis twist: Promotion format pulls sponsor/talking points from Brand DNA).
- Gemini: sources → Interview Cut Sheet generation (A-roll/SOT beats + rationale +
  formula summary + **fact-check list** + **hook alternatives**, Search-grounded).
  `sanitizePII()` on source text.
- Script project page: cut-sheet cards, Fact Check + Receipts + Versions + Hook Lab
  panels, **Give Feedback → Revise Script** (new version each time), word/time budget,
  Edit, Export, **Approve** gate (sets status `approved`, unlocks B-roll tab).
- **Teleprompter view**: full-screen scrolling A-roll display (simple, high value).
- DB: `clip_projects`, `clip_sources`, `clip_generations`, `clip_script_beats`.

### Phase C2 — B-roll Planner — ✅ BUILT 2026-07-03
Gemini turns the approved cut sheet into a beat plan: `trellis_clip_broll_beats`
(beat_type from the 7-template library, timing, editable Remotion direction,
structured `template_params` that drive the renderer, Seedance/Veo footage prompts).
UI: beat cards with triage (Keep/Reject/Winner/Made-the-edit), filters
(all/rendered/kept/undecided/failed), Render Queue counts, Render All.

### Phase C3 — Render Worker + Queue — ✅ BUILT 2026-07-03
`workers/clip-render-worker/` (Node + Remotion): polls `trellis_clip_render_jobs`,
renders the beat's parameterized template (7 templates in `remotion/Templates.tsx`,
1080x1920@30, silent), ffprobe QA, uploads to the `clip-assets` bucket, writes QA
chips. Runs tab shows job history. Setup: `npm install` + service key env, see its
README. Needs ffmpeg on PATH for assembly.

### Phase C4 — Assembly + Publish — ✅ BUILT 2026-07-03
Publish tab: kept/winner clips stitch in beat order via an `assemble` job (ffmpeg
concat in the same worker) → `final_video_url` on the project. Publish: Gemini
Shorts metadata (editable) → `trellis_clip_publications` + `CLIP_PUBLISH_WEBHOOK`
→ n8n blueprint `n8n-blueprints/E8-clip-publish.json` (same YouTube OAuth + Hub
Supabase credentials as E4). Import E8 into n8n before first publish.

---

## Open Questions

- [ ] **Runs tab** — the one remaining unseen screen. What does a run record contain?
      (agent transcript? cost breakdown? retries?)
- [x] Source ingest UX — URLs + pasted text + files (PDF/TXT/MD/CSV/SRT/VTT/JSON). ✔ seen
- [x] Teleprompter — built into the script view. ✔ seen
- [x] Project list — Script Library with cost/token tracking, ratings, Set Production. ✔ seen
- [x] Script iteration — Give Feedback → Revise Script, versions panel, Approve gate,
      Regenerate-with-model. ✔ seen
- [ ] Whether "Learned Formula" is user-editable, per-project, or a global evolving asset.
      (Hook Lab labels suggest a library of named formula archetypes: Naive Question to
      Mechanism, News Event to Stakes, before-after, secret-cost…)
- [ ] Model picker: ship Gemini-only in C1, or wire the provider-agnostic picker from
      day one? **Leaning: Gemini-only C1, picker UI stubbed.**
- [ ] Render engine: freeform Remotion codegen (highest fidelity, needs typecheck loop)
      vs. a fixed library of parameterized Remotion templates per beat type (much cheaper
      QA, less flexible). **Leaning: parameterized templates for the 7 observed beat
      types first, graduate to freeform codegen later.**
- [ ] "Set Production" semantics — does production state gate the B-roll/publish phases?

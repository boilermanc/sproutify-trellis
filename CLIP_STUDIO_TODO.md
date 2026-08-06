# Clip Studio — Remaining Work

> Companion to `CLIP_STUDIO_SCOPE.md`. Captures what's done as of this session
> and what's still open, with concrete pointers. Newest work at the top.

## Done this session (branch `claude/pull-latest-main-g9ubra`)

- **Auto-fit text sizing** — templates size text per render via `fitText` so
  nothing is tiny or overflowing (`workers/clip-render-worker/remotion/Templates.tsx`).
- **Brand DNA drives content** — scripts speak in the branch's name/tagline/tone
  with its own CTA; B-roll background + accents come from the branch's real
  colors; font threads through. Resolver: `services/clipBrand.ts` (reads the
  `branches` table by slug). Higher temperature + `responseMimeType:'application/json'`.
- **Correctly-formatted directions** — `coerceBeatParams` in `services/clipService.ts`
  validates/repairs each beat's `template_params` per template type (quote cards
  need a quote, timeline needs items or it downgrades, highlight words must be
  real substrings, unused fields stripped) so beats never render blank.
- **Per-beat regenerate** — "Reprompt + Generate" on each B-roll beat re-derives
  just that beat's params from the creator's edited direction, scoped to its own
  template (`regenerateBeat` in `services/clipService.ts`).
- **Finished video in the Library** — Library cards show a 9:16 poster, "Video"
  badge, download, and a "With video" filter (`pages/ClipStudio.tsx`).
- **Music bed (Audio Phase A)** — Audio panel directs a music track (prompt +
  genre/mood/vocals) generated through the existing Lyria path
  (`submitMusicJob` → `music_generations`); the worker's `assemble` muxes it onto
  the video (ffmpeg `apad + -shortest`). Columns: `music_job_id`, `audio_url`,
  `audio_config` on `trellis_clip_projects`
  (migration `supabase/migrations/20260806120000_add_clip_audio_columns.sql`).

---

## Open work (ranked)

### 1. Publish to Instagram / TikTok / Facebook (not just YouTube)  — HIGH VALUE, mostly reuse
The stitched short is already the right format (1080x1920 vertical MP4 = Reels /
TikTok / Shorts), and the app **already has a working social publish path** —
it's just not wired into Clip Studio, which today only publishes to YouTube via
E8 (`publishClip` → `CLIP_PUBLISH_WEBHOOK`).

Reuse targets in `services/socialService.ts`:
- `publishToSocial(...)` → Instagram/Facebook via the `trellis-social-publish`
  webhook. Payload takes `{ branch_id, caption, media_type:'video', media_urls }`.
- `publishToTikTok(mediaType='video', mediaUrls=[...])`.
- Instagram video publishing needs a **public** media URL — `final_video_url`
  lives in the public `clip-assets` bucket, so it qualifies as-is.

What to build:
- Add Instagram/TikTok/Facebook targets to the Clip Studio Publish tab alongside
  YouTube (platform picker), passing `selected.final_video_url` as the single
  `media_urls` item and the generated caption/hashtags.
- Resolve `branch_id` from the clip's branch slug (the social path is keyed by
  branch UUID, not slug — see how SocialHub resolves it).
- Track these publications too. Either extend `trellis_clip_publications` to
  carry non-YouTube platforms, or record through the social path's own tables.
- Gate on the branch actually having a connected Meta/TikTok account
  (`checkConnections(branchId)` already exists in `socialService.ts`).

**Interim answer to "can this go on Instagram?"**: yes — download the MP4 from
the Publish tab (or Library) and post it as a Reel manually. Native in-app
Instagram publishing is the work above.

### 2. Voiceover (Audio Phase B) + mixed audio (Phase C)  — NET-NEW TTS
Decided: **Gemini TTS** (reuses the Gemini keys already in `tenant_secrets`; no
new vendor). There is **no TTS anywhere in the codebase today** — `voice_id` in
the video-ad blueprints is a dormant placeholder that calls nothing.

- **Phase B — Voiceover:** generate narration from the A-roll script
  (`current.script` lane `aroll`) via Gemini TTS → store as an audio track →
  extend the worker to mux it like the music bed. The Audio panel already stubs
  **Voiceover · soon** and **Both · soon** (`pages/ClipStudio.tsx`), and
  `ClipAudioConfig.kind` already allows `'voiceover' | 'both'`.
- **Phase C — Both, mixed:** generate voice + music and mix with the music
  ducked under the voice (ffmpeg `amix` + sidechain/volume). Worker `assemble`
  would take two audio inputs instead of one.
- Note: the "final video" today is **silent B-roll only** — the creator's own
  talking-head A-roll is never combined in-app (it's recorded off the
  teleprompter and edited externally). Voiceover is what makes the in-app output
  a self-contained narrated short. Worth confirming that's the intended shape.

### 3. Validate the ffmpeg audio mux on real ffmpeg  — VERIFICATION DEBT
The music-bed mux (`assemble` in `workers/clip-render-worker/worker.mjs`) could
not be render-tested in the build sandbox (only a stripped Playwright ffmpeg was
available — no x264/aac). The command is the standard `apad + -shortest` idiom
and the surrounding concat/upload/patch is unchanged from the working silent
path, but the **first real stitch-with-music should be eyeballed** on a machine
with full ffmpeg (which the worker requires anyway per its README). Check: audio
present, A/V in sync, output runs the video's full length (not cut to a short
bed, not extended by a long one).

### 4. Link a clip to an Episode  — DESIGNED, UNBUILT
Schema/type carry `episode_id` ("a Short promoting an episode") but there's no
UI to set it and finished shorts don't surface on the Episode. Would let a clip
be created from / attached to a `trellis_episodes` row and shown there.

### 5. Thumbnail chooser  — MINOR
Episodes have a thumbnail composer; clips rely on YouTube's auto-frame. Could add
a pick-a-frame or generated cover for the short.

### 6. Small UX  — MINOR
- "Keep all rendered" shortcut in the B-roll tab (assembly needs manual triage;
  no bulk-keep today).
- After a per-beat regenerate or re-stitch, a prior publication still points at
  the old video — surface a "video changed since publish" hint.

---

## Operational prerequisites (already required, easy to forget)
- **Music bed** depends on the Lyria music webhook (`MUSIC_GEN_WEBHOOK`,
  n8n `E1-music-generator`) being live and writing `music_generations` rows.
- **Rendering + stitching** need the clip worker running with **ffmpeg on PATH**
  and the legacy `eyJ...` service-role key (`workers/clip-render-worker`).
- **YouTube publish** needs n8n `E8-clip-publish` imported with the YouTube OAuth
  + Hub Supabase credentials (same as E4-episode-publish).

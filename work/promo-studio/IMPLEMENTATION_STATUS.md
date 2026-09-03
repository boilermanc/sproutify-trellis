# Trellis Promo Studio implementation status

Updated: 2026-09-03

## Completed increments

- PS-002: real 10-second Rekkrd vertical proof with pinned source evidence, real UI capture, Google voice, Lyria music, captions, Remotion composition, FFmpeg finalization, and delivery QA.
- PS-003: Promo Manifest v1 Zod schema, JSON Schema export, draft/final semantic gates, stable error codes, canonical JSON, fingerprints, and a final Rekkrd fixture.
- PS-004: Promo aggregate tables, immutable manifest revisions, claims/assets/scenes/takes/captures/jobs/approvals/events, private Storage bucket, forced RLS, explicit grants, indexes, leases, atomic `SKIP LOCKED` job claim, and worker transitions.
- PS-005: authenticated `promo-studio` Edge Function for projects, revisions, jobs, approvals, private asset transfers, fingerprints, sanitization, and audit events.
- PS-006: first-class Promo Studio navigation route, create/reopen workspace, branch and format selection, actual manifest gate status, job controls, and loading/empty/error states.
- PS-007 foundation: bounded GitHub evidence adapter with commit pinning, allow/deny paths, secret filters, file count/size caps, framework/routes/test-selector/feature/asset extraction, citations, and audit events.
- PS-008: strict Creative Director plan schema, evidence-bound claims/script/storyboard/capture/music plan, immutable review revision, Claims Review, and editable display/speech phrases. Generated output remains data-only and cannot create jobs or approve claims.
- Review gates: verified/user-attested claim approval and script approval now create immutable revisions and approval records; generic revision saves cannot bypass either gate.
- Capture worker contract: capture queue input is resolved from the active manifest and branch source server-side, contains no URL/fixture/auth secrets, and fails closed until the production environment and fixture are configured. The executable worker remains disabled.
- Atomic capture completion: a service-role-only transaction locks the active capture lease; revalidates the current revision, active branch source, pinned scenario, fixture/auth references, route, masks, and passing assertions; verifies deterministic private Storage objects and exact trace bytes; and registers the video, stills, trace, capture run, scenario status, attempt, job, and audit event together.
- Capture worker runtime: provider-independent preflight/execution modules and a default-off Node 22 polling process claim only capture jobs, resolve current branch/scenario plus server-only fixture/auth maps, and call only `complete_promo_capture_job`. The bounded Playwright adapter blocks service workers, private-network requests, and cross-origin document navigation; applies masks; evaluates the approved assertion vocabulary; scans visible text for obvious PII/secrets; records with configured Chromium; measures/transcodes with FFmpeg/ffprobe; uploads immutable private artifacts; and cleans up rejected uploads.
- Immutable capture adoption: a browser request may identify only a succeeded capture run. The server reloads the active revision, verified normalized scenario, exact ready artifacts, and unique completion audit lineage; then creates a child manifest revision that marks the scenario verified, binds its real UI video to matching scenes, records artifact provenance/checksums, and preserves the parent revision unchanged.
- Cross-revision asset bindings: `promo_assets.revision_id` remains immutable origin ownership while `promo_revision_assets` explicitly authorizes reuse by child revisions. New assets receive an origin binding automatically, historical manifest references are backfilled, child revisions carry forward only parent-bound UUID assets, project consistency is enforced in the database, and render queue/worker preflight now require active-revision bindings.
- Branch-wide production readiness: Promo Studio lists every accessible active branch, resolves repository, active Brand Identity, capture environment/fixture, and Instagram-account readiness by branch identity, and exposes an owner/admin-only source configuration panel. There is no Rekkrd-only runtime branch; Rekkrd remains the first acceptance fixture.
- Voice worker contract: generation and alignment inputs are resolved from the approved active manifest, preserve pronunciation-safe speech text separately from display copy, use opaque branch-derived voice profiles, and exclude browser-supplied provider settings and credentials.
- Gemini voice and alignment executor: a dedicated Node worker claims only `voice_generate` and `voice_align`, resolves optional per-profile Gemini voices from server environment, synthesizes approved phrases as exact WAV segments, heartbeats between provider calls, writes deterministic private WAV/alignment assets, cleans up rejected uploads, and completes through the atomic voice RPCs. Claims remain default-off until deployment prerequisites are verified.
- Music worker runtime: generation inputs are resolved from the approved structured manifest, remain strictly instrumental, reserve take numbers atomically, and exclude browser prompts, provider settings, and credentials. A default-off Node 22 worker claims only music jobs, resolves opaque sonic profiles to approved server-side Lyria configuration, rejects imitation instructions, normalizes provider audio to measured stereo 48 kHz PCM WAV with FFmpeg/ffprobe, uploads immutable private audio, cleans up rejected uploads, and calls only `complete_promo_music_generation_job`.
- Camera-direction contract: Creative Director storyboards and Promo Manifest scenes use a bounded provider-neutral catalog of 46 movements, with separate movement, execution, speed, framing, end-frame, subject-action, and mood semantics. Unsupported execution claims fail closed instead of silently becoming vendor prompt text.
- Audio completion and adoption: service-role-only lease-bound transactions now verify deterministic private voice/music/alignment objects, register output assets and take rows, complete attempts/jobs/audit together, and require explicit immutable operator adoption before selection. Aligned voice adoption also creates display-text caption cues.
- Final publishing handoff: a current-revision final render can be approved and inserted into `scheduled_social_posts` atomically for Instagram. The existing scheduler resolves the private Promo asset only after claiming the due row and signs it just in time; no expiring URL is persisted.
- Render worker contract: preview/final inputs are resolved from the active manifest and checksum-verified private assets, captions are rebuilt from approved display phrases, vertical output is fixed to 1080x1920, and final rendering requires current preview approval. The Rekkrd proof composition is explicitly not enabled as a cross-branch production template.
- Composition registry: render jobs accept only pinned key/version pairs. `PromoProof@ps-002-v1` remains Rekkrd-only and proof-only, while `vertical-ui-story@v1` is worker-enabled for all branches after passing the isolated executor contract.
- Branch-neutral composition: `vertical-ui-story@v1` is registered in the existing Remotion bundle and accepts only resolved media, normalized scenes/captions, approved brand presentation, safe areas, and review metadata. Its LF-normalized source fingerprint is pinned in the server registry. The Rekkrd fixture passed visual review plus 1080x1920, 30 fps, exact 10-second, H.264/yuv420p, AAC/48 kHz, -14 ±0.5 LUFS, and ≤-1.5 dBTP delivery QA; external runtime claims remain independently default-off.
- Branch presentation envelope: render jobs resolve one active Brand Identity by authoritative branch slug, bind its approval record and timestamp to the live branch UUID, and pass only normalized palette, typography, and an optional approved private logo asset. Rekkrd preserves its already-approved locked style registry values; missing or ambiguous identities fail closed.
- Pinned delivery pipeline: `vertical-h264-v1` exposes bounded FFmpeg/ffprobe argument arrays for two-pass -14 LUFS/-1.5 dBTP normalization, H.264 High/yuv420p, AAC 48 kHz, TV range, fast start, and delivery probing. The registry pins its normalized source fingerprint, render queueing rejects a mismatched manifest, and a full Rekkrd rerender passed the existing 1080x1920 production QA contract.
- Isolated render executor: the Node 22 runtime claims only preview/final render jobs, revalidates live project/approval/asset state, heartbeats its lease, downloads checksum-verified private assets, renders the branch-neutral composition, applies the pinned delivery pipeline, uploads immutable render/QA objects with required metadata, cleans up rejected outputs, and calls only `complete_promo_render_job`. Runtime claims remain default-off through `PROMO_RENDER_CLAIMS_ENABLED` until the process is installed.
- Preview review contract: selection accepts only a ready 1080x1920 private asset produced by a succeeded current-revision preview job; decisions are bound to that selected asset, and final render readiness uses its latest decision.
- Render completion contract: a service-role-only transaction verifies the active render lease, deterministic private Storage objects, checksums, delivery-profile QA, and tool/input fingerprints before registering the render plus QA assets and completing the job.
- Guided production workflow: one branch-neutral action advances planning, verified capture, narration generation, caption alignment, music generation, preview rendering, and preview selection in order. It pauses at claims, script, narration, music, and preview review; failed jobs require an explicit retry; signed private audio/video previews are playable in the review gate; and job controls live under Advanced.
- Cross-revision voice alignment: alignment revalidates the audio asset through the active revision binding, allowing the immutable voice master created on its origin revision to remain valid after adoption creates a child revision. Unbound audio still fails closed.
- Durable no-op worker: a filtered service worker proves claim/lease/complete behavior without claiming future job types.

## Exact deployment artifacts

- Migration: `supabase/migrations/20260825162352_add_promo_studio_foundation.sql`
- Master Schema Engine mapping: `constants.ts` imports the migration verbatim with Vite `?raw`.
- User API: `supabase/functions/promo-studio/index.ts`
- No-op worker: `supabase/functions/promo-worker/index.ts`
- Shared server contracts: `supabase/functions/_shared/promo-studio.ts`, `supabase/functions/_shared/github-evidence.ts`, `supabase/functions/_shared/promo-creative-plan.ts`, `supabase/functions/_shared/promo-presentation.ts`
- Capture queue contract: `supabase/functions/_shared/promo-capture.ts`
- Voice queue contract: `supabase/functions/_shared/promo-voice.ts`
- Music queue contract: `supabase/functions/_shared/promo-music.ts`
- Render queue contract: `supabase/functions/_shared/promo-render.ts`
- Render completion migration: `supabase/migrations/20260825211425_complete_promo_render_job.sql`
- Capture completion migration: `supabase/migrations/20260826180018_complete_promo_capture_job.sql`
- Revision asset binding migration: `supabase/migrations/20260826183711_add_promo_revision_asset_bindings.sql`
- Capture worker boundary: `workers/promo-capture-worker/preflight.mjs`, `workers/promo-capture-worker/executor.mjs`, `workers/promo-capture-worker/README.md`
- Voice worker: `workers/promo-voice-worker/run.mjs`, generation/alignment preflight and executor modules, `workers/promo-voice-worker/gemini-tts.mjs`
- Capture worker: `workers/promo-capture-worker/run.mjs`, runtime/preflight/executor/browser adapter modules, locked Node dependencies, environment template, and systemd service template
- Music worker: `workers/promo-music-worker/run.mjs`, runtime/preflight/executor/Lyria/FFmpeg modules, locked Node dependencies, environment template, and systemd service template
- External reference watchlist: `work/promo-studio/REFERENCE_WATCHLIST.md`
- Function import map: `supabase/functions/promo-studio/deno.json`
- Browser service: `services/promoStudioService.ts`
- UI: `pages/PromoStudio.tsx`, plus `App.tsx`, `components/Layout.tsx`, and `types.ts`
- Guided workflow planner: `features/promo-studio/guidedWorkflow.ts`
- Canonical client/worker manifest: `features/promo-studio/schemas/promoManifest.ts`

## Configuration and credentials

Required for deployed operation:

- Standard Supabase Function variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Read-only GitHub access for private repositories: `GITHUB_READ_TOKEN` (preferred) or `GITHUB_TOKEN`. Public repositories can be scanned without a token but remain rate-limited.
- Worker invocation: either a service-role bearer token or `PROMO_WORKER_SECRET` sent as `x-promo-worker-secret`.
- Optional stable worker identity: `PROMO_WORKER_ID`; defaults to `promo-edge-noop-v1`.
- A scheduler must invoke `promo-worker` until the queue is empty. The cadence and hosting mechanism are deployment decisions; none was invented in code.
- Voice runtime: `GEMINI_API_KEY`, optional `PROMO_GEMINI_TTS_VOICE`, optional per-profile `PROMO_GEMINI_VOICE_MAP_JSON`, and explicit `PROMO_VOICE_CLAIMS_ENABLED=true` only after the migrations and private bucket are deployed.
- Capture runtime: `PROMO_CAPTURE_BROWSER_EXECUTABLE`, `FFMPEG_PATH`, `FFPROBE_PATH`, server-only fixture/auth JSON maps, and explicit `PROMO_CAPTURE_CLAIMS_ENABLED=true` only for a verified environment.
- Music runtime: `GEMINI_API_KEY`, `PROMO_LYRIA_PROFILE_MAP_JSON`, `FFMPEG_PATH`, `FFPROBE_PATH`, and explicit `PROMO_MUSIC_CLAIMS_ENABLED=true` only after a controlled provider smoke test.

Existing provider credentials remain in their current server-side locations. No GitHub, Supabase service-role, voice, Lyria, capture-login, or fixture credentials were added to the browser bundle or repository.

## Verification completed

- Promo Manifest contracts: 9 passing.
- Edge boundary/draft contracts: 5 passing.
- Database/RLS/job static contracts: 6 passing.
- Promo route/browser-boundary/worker contracts: 4 passing.
- GitHub evidence security/extraction contracts: 4 passing.
- Creative planning contracts: 4 passing.
- Approval gate contracts: 4 passing.
- Capture queue/completion/adoption/executor contracts: 13 passing.
- Consolidated Promo Studio regression suite: 148 passing, including default-off capture/music runtimes, atomic completion boundaries, real FFmpeg music normalization, the branch-neutral guided state machine, branch readiness, a non-Rekkrd creative materialization case, segmented voice/alignment, render, approval, and publishing contracts.
- Music queue contracts: 4 passing.
- Render queue contracts: 4 passing.
- Preview review contracts: 3 passing.
- Render completion contracts: 3 passing.
- PS-002 proof contracts: 10 passing.
- TypeScript: `npx tsc --noEmit` passes.
- Edge Functions: Deno type-check passes for `promo-studio` and `promo-worker`.
- Production build: `npm run build` passes. On 2026-09-03 the two audio/publishing migrations were applied to the Hub, `promo-studio` v17 was deployed with JWT verification, and the guided frontend was verified live at commit `df71060` through the `main` release workflow.
- Responsive UI smoke check: desktop and 390px mobile Promo Studio layouts render without horizontal overflow or browser console warnings/errors.
- Diff hygiene: `git diff --check` passes.

## Blockers carried forward

1. Docker Desktop is not running, so production-backed verification is stronger than the unavailable local-stack check, but concurrent-claim behavior still lacks a local integration test.
2. `GITHUB_READ_TOKEN` is not configured in the Hub function secrets. Rekkrd is private, so production evidence scanning and Creative Director generation stop before the provider call with an explicit credential blocker.
3. Each branch still needs its verified repository/capture source configured. The Hub currently has nine active branches and active Brand Identities for eight; Sweetwater Urban Farms needs a completed active Brand Identity.
4. Gemini TTS and exact phrase alignment are implemented, but the worker is not installed or enabled on the VPS. Per-profile voice choices must be added server-side where a branch should not use the default voice. Word-level timing remains intentionally absent until a trustworthy provider is selected.
5. The deployed Edge worker remains intentionally no-op-only. Capture, music, voice, and render now have isolated external runtimes, but they still require VPS installation, server-only configuration, and one controlled job each before their independent claim switches are enabled. The active S1 scheduler is still required for production publishing.
6. The production SSH endpoint is `sproutify-prod:2222`. Direct SSH from the Codex execution environment timed out before authentication, so the VPS worker installation could not be completed from this session.

## Next gate

Restore an SSH-capable route to `sproutify-prod:2222`, then configure verified source records for each branch. Complete Sweetwater Urban Farms' Brand Identity; install capture, voice, music, and render services with all claim switches initially off; and run one approval-first non-Rekkrd smoke job stage by stage before enabling continuous claims. Exercise private repository evidence only after a fine-grained, read-only `GITHUB_READ_TOKEN` is configured; do not fabricate repository evidence or weaken access controls.

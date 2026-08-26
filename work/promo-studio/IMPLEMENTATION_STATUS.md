# Trellis Promo Studio implementation status

Updated: 2026-08-26

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
- Isolated capture executor: provider-independent preflight and execution modules resolve only current server-side branch/scenario context, obtain fixture and auth secrets through injected worker adapters, verify bounded video/still/assertion/PII output, upload immutable artifacts, clean up rejected uploads, and call only `complete_promo_capture_job`. No browser provider or production polling loop is installed, and capture claims remain disabled.
- Immutable capture adoption: a browser request may identify only a succeeded capture run. The server reloads the active revision, verified normalized scenario, exact ready artifacts, and unique completion audit lineage; then creates a child manifest revision that marks the scenario verified, binds its real UI video to matching scenes, records artifact provenance/checksums, and preserves the parent revision unchanged.
- Cross-revision asset bindings: `promo_assets.revision_id` remains immutable origin ownership while `promo_revision_assets` explicitly authorizes reuse by child revisions. New assets receive an origin binding automatically, historical manifest references are backfilled, child revisions carry forward only parent-bound UUID assets, project consistency is enforced in the database, and render queue/worker preflight now require active-revision bindings.
- Voice worker contract: generation and alignment inputs are resolved from the approved active manifest, preserve pronunciation-safe speech text separately from display copy, use opaque voice profiles, and exclude browser-supplied provider settings and credentials. The executable worker remains disabled pending a provider decision.
- Music worker contract: generation inputs are resolved from the approved structured manifest, remain strictly instrumental, reserve take numbers atomically, and exclude browser prompts, provider settings, and credentials. Existing Lyria paths are documented as adapter candidates, not direct Promo persistence boundaries.
- Render worker contract: preview/final inputs are resolved from the active manifest and checksum-verified private assets, captions are rebuilt from approved display phrases, vertical output is fixed to 1080x1920, and final rendering requires current preview approval. The Rekkrd proof composition is explicitly not enabled as a cross-branch production template.
- Composition registry: render jobs accept only pinned key/version pairs. `PromoProof@ps-002-v1` remains Rekkrd-only and proof-only, while `vertical-ui-story@v1` is worker-enabled for all branches after passing the isolated executor contract.
- Branch-neutral composition: `vertical-ui-story@v1` is registered in the existing Remotion bundle and accepts only resolved media, normalized scenes/captions, approved brand presentation, safe areas, and review metadata. Its LF-normalized source fingerprint is pinned in the server registry. The Rekkrd fixture passed visual review plus 1080x1920, 30 fps, exact 10-second, H.264/yuv420p, AAC/48 kHz, -14 ±0.5 LUFS, and ≤-1.5 dBTP delivery QA; external runtime claims remain independently default-off.
- Branch presentation envelope: render jobs resolve one active Brand Identity by authoritative branch slug, bind its approval record and timestamp to the live branch UUID, and pass only normalized palette, typography, and an optional approved private logo asset. Rekkrd preserves its already-approved locked style registry values; missing or ambiguous identities fail closed.
- Pinned delivery pipeline: `vertical-h264-v1` exposes bounded FFmpeg/ffprobe argument arrays for two-pass -14 LUFS/-1.5 dBTP normalization, H.264 High/yuv420p, AAC 48 kHz, TV range, fast start, and delivery probing. The registry pins its normalized source fingerprint, render queueing rejects a mismatched manifest, and a full Rekkrd rerender passed the existing 1080x1920 production QA contract.
- Isolated render executor: the Node 22 runtime claims only preview/final render jobs, revalidates live project/approval/asset state, heartbeats its lease, downloads checksum-verified private assets, renders the branch-neutral composition, applies the pinned delivery pipeline, uploads immutable render/QA objects with required metadata, cleans up rejected outputs, and calls only `complete_promo_render_job`. Runtime claims remain default-off through `PROMO_RENDER_CLAIMS_ENABLED` until the process is installed.
- Preview review contract: selection accepts only a ready 1080x1920 private asset produced by a succeeded current-revision preview job; decisions are bound to that selected asset, and final render readiness uses its latest decision.
- Render completion contract: a service-role-only transaction verifies the active render lease, deterministic private Storage objects, checksums, delivery-profile QA, and tool/input fingerprints before registering the render plus QA assets and completing the job.
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
- External reference watchlist: `work/promo-studio/REFERENCE_WATCHLIST.md`
- Function import map: `supabase/functions/promo-studio/deno.json`
- Browser service: `services/promoStudioService.ts`
- UI: `pages/PromoStudio.tsx`, plus `App.tsx`, `components/Layout.tsx`, and `types.ts`
- Canonical client/worker manifest: `features/promo-studio/schemas/promoManifest.ts`

## Configuration and credentials

Required for deployed operation:

- Standard Supabase Function variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Read-only GitHub access for private repositories: `GITHUB_READ_TOKEN` (preferred) or `GITHUB_TOKEN`. Public repositories can be scanned without a token but remain rate-limited.
- Worker invocation: either a service-role bearer token or `PROMO_WORKER_SECRET` sent as `x-promo-worker-secret`.
- Optional stable worker identity: `PROMO_WORKER_ID`; defaults to `promo-edge-noop-v1`.
- A scheduler must invoke `promo-worker` until the queue is empty. The cadence and hosting mechanism are deployment decisions; none was invented in code.

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
- Voice queue contracts: 5 passing.
- Music queue contracts: 4 passing.
- Render queue contracts: 4 passing.
- Preview review contracts: 3 passing.
- Render completion contracts: 3 passing.
- PS-002 proof contracts: 10 passing.
- TypeScript: `npx tsc --noEmit` passes.
- Edge Functions: Deno type-check passes for `promo-studio` and `promo-worker`.
- Production: `npm run build` passes; `promo-studio` is active; the `main` frontend deployment for PR #27 passed.
- Diff hygiene: `git diff --check` passes.

## Blockers carried forward

1. Docker Desktop is not running, so production-backed verification is stronger than the unavailable local-stack check, but concurrent-claim behavior still lacks a local integration test.
2. `GITHUB_READ_TOKEN` is not configured in the Hub function secrets. Rekkrd is private, so production evidence scanning and Creative Director generation stop before the provider call with an explicit credential blocker.
3. A production Rekkrd capture URL, capture auth profile, fixture-account owner, and allowed production routes are still external decisions. The local PS-002 capture remains valid evidence for the proof only.
4. Voice-provider production selection is still open. PS-002 proves Google Gemini TTS and preserves display text separately from pronunciation text; no production voice was selected or claimed.
5. The deployed Edge worker remains intentionally no-op-only. Capture, voice, alignment, music, export, and publishing remain queued architecture. The render executor and composition contract are implemented and verified; production operation now requires installing the external Node process and enabling its independent claim switch.

## Next gate

Add the same immutable result-adoption boundary for completed voice/alignment and music jobs, then connect those server-verified outputs to the active manifest without enabling provider claims. Exercise private Rekkrd repository evidence only after a fine-grained, read-only `GITHUB_READ_TOKEN` is configured; do not fabricate repository evidence or weaken access controls.

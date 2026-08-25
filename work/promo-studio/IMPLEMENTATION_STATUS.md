# Trellis Promo Studio implementation status

Updated: 2026-08-25

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
- Voice worker contract: generation and alignment inputs are resolved from the approved active manifest, preserve pronunciation-safe speech text separately from display copy, use opaque voice profiles, and exclude browser-supplied provider settings and credentials. The executable worker remains disabled pending a provider decision.
- Music worker contract: generation inputs are resolved from the approved structured manifest, remain strictly instrumental, reserve take numbers atomically, and exclude browser prompts, provider settings, and credentials. Existing Lyria paths are documented as adapter candidates, not direct Promo persistence boundaries.
- Render worker contract: preview/final inputs are resolved from the active manifest and checksum-verified private assets, captions are rebuilt from approved display phrases, vertical output is fixed to 1080x1920, and final rendering requires current preview approval. The Rekkrd proof composition is explicitly not enabled as a cross-branch production template.
- Preview review contract: selection accepts only a ready 1080x1920 private asset produced by a succeeded current-revision preview job; decisions are bound to that selected asset, and final render readiness uses its latest decision.
- Render completion contract: a service-role-only transaction verifies the active render lease, deterministic private Storage objects, checksums, delivery-profile QA, and tool/input fingerprints before registering the render plus QA assets and completing the job.
- Durable no-op worker: a filtered service worker proves claim/lease/complete behavior without claiming future job types.

## Exact deployment artifacts

- Migration: `supabase/migrations/20260825162352_add_promo_studio_foundation.sql`
- Master Schema Engine mapping: `constants.ts` imports the migration verbatim with Vite `?raw`.
- User API: `supabase/functions/promo-studio/index.ts`
- No-op worker: `supabase/functions/promo-worker/index.ts`
- Shared server contracts: `supabase/functions/_shared/promo-studio.ts`, `supabase/functions/_shared/github-evidence.ts`, `supabase/functions/_shared/promo-creative-plan.ts`
- Capture queue contract: `supabase/functions/_shared/promo-capture.ts`
- Voice queue contract: `supabase/functions/_shared/promo-voice.ts`
- Music queue contract: `supabase/functions/_shared/promo-music.ts`
- Render queue contract: `supabase/functions/_shared/promo-render.ts`
- Render completion migration: `supabase/migrations/20260825211425_complete_promo_render_job.sql`
- Future worker boundary: `workers/promo-capture-worker/README.md`
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
- Capture queue contracts: 3 passing.
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
5. The no-op worker is intentionally the only executable worker type. Capture, voice, alignment, music, rendering, export, and publishing remain queued architecture until their corresponding workers are implemented.

## Next gate

Exercise PS-008 against the private Rekkrd repository after a fine-grained, read-only `GITHUB_READ_TOKEN` is configured. Until then, continue only with provider-independent review and worker foundations; do not fabricate repository evidence or weaken access controls.

# Trellis Promo Studio implementation status

Updated: 2026-08-25

## Completed increments

- PS-002: real 10-second Rekkrd vertical proof with pinned source evidence, real UI capture, Google voice, Lyria music, captions, Remotion composition, FFmpeg finalization, and delivery QA.
- PS-003: Promo Manifest v1 Zod schema, JSON Schema export, draft/final semantic gates, stable error codes, canonical JSON, fingerprints, and a final Rekkrd fixture.
- PS-004: Promo aggregate tables, immutable manifest revisions, claims/assets/scenes/takes/captures/jobs/approvals/events, private Storage bucket, forced RLS, explicit grants, indexes, leases, atomic `SKIP LOCKED` job claim, and worker transitions.
- PS-005: authenticated `promo-studio` Edge Function for projects, revisions, jobs, approvals, private asset transfers, fingerprints, sanitization, and audit events.
- PS-006: first-class Promo Studio navigation route, create/reopen workspace, branch and format selection, actual manifest gate status, job controls, and loading/empty/error states.
- PS-007 foundation: bounded GitHub evidence adapter with commit pinning, allow/deny paths, secret filters, file count/size caps, framework/routes/test-selector/feature/asset extraction, citations, and audit events.
- Durable no-op worker: a filtered service worker proves claim/lease/complete behavior without claiming future job types.

## Exact deployment artifacts

- Migration: `supabase/migrations/20260825162352_add_promo_studio_foundation.sql`
- Master Schema Engine mapping: `constants.ts` imports the migration verbatim with Vite `?raw`.
- User API: `supabase/functions/promo-studio/index.ts`
- No-op worker: `supabase/functions/promo-worker/index.ts`
- Shared server contracts: `supabase/functions/_shared/promo-studio.ts`, `supabase/functions/_shared/github-evidence.ts`
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
- Promo route/browser-boundary/worker contracts: 3 passing.
- GitHub evidence security/extraction contracts: 3 passing.
- PS-002 proof contracts: 10 passing.
- TypeScript: `npx tsc --noEmit` passes.
- Edge Functions: Deno type-check passes for `promo-studio` and `promo-worker`.
- Production: `npm run build` passes.
- Diff hygiene: `git diff --check` passes.

## Blockers carried forward

1. Docker Desktop is not running, so the migration, RLS, concurrent-claim behavior, and Edge Functions could not be exercised against a local Supabase stack. Static and type-level tests pass; this is not a substitute for database execution.
2. The migration has not been applied to the Hub Supabase project and the two functions have not been deployed. The UI therefore intentionally shows its deployment-unavailable state in the current live environment.
3. The pinned Rekkrd fixture identifies `boilermanc/rekkrd` at commit `64bff1062609df08de827884328a64ffada01d63`, but a live GitHub API scan needs read access if that repository is private.
4. A production Rekkrd capture URL, capture auth profile, fixture-account owner, and allowed production routes are still external decisions. The local PS-002 capture remains valid evidence for the proof only.
5. Voice-provider production selection is still open. PS-002 proves Google Gemini TTS and preserves display text separately from pronunciation text; no production voice was selected or claimed.
6. The no-op worker is intentionally the only executable worker type. Evidence planning, capture, voice, alignment, music, rendering, export, and publishing remain queued architecture until their corresponding workers are implemented.

## Next unblocked issue

PS-008: build the normalized brief, claims ledger, strictly validated Creative Director output, script/phrase editor, preliminary storyboard, capture plan, and music brief. Raw model output must remain data-only and cannot create jobs, captures, provider requests, or publishing actions.

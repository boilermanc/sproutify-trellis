# Opportunity Finder implementation status

Date: 2026-09-22. Brand-brief backend deployed to the Trellis Hub; frontend release authorized and queued for main. New brand-aware collection is not active.

## Implemented locally

- Runtime brief schema, approval/freshness/readiness rules and immutable revision checks.
- Draft lineage preserving opportunity identity, brief version and selected fact/evidence IDs.
- Content Intelligence **Brand Brief** tab: structured fields, explicit save/approval, history, missing-profile/backend states and read-only controls.
- Offerings, audience associations, nullable priority weights/dates, voice, query seeds, seasonal context, claims/evidence, review dates, canonical pages, caveats and calls to action.
- Fact changes clear approval; status-only withdrawal preserves historical evidence/reviewer attribution.
- Append-only storage migration and authenticated `opportunity-briefs` function. Every save and approval appends a snapshot; approved records are not updated in place. Stale predecessor IDs produce conflicts.
- Reviewer/author identity, scope, version IDs and timestamps assigned server-side. Approvals use the persisted draft, not browser replacement content.

## Authorization policy

Active owner/admin roles have global access. Other active users need an assignment to the actual branch. Assigned operators with member/lead branch roles may save; assigned operator leads may approve. Assigned read-only users cannot save or approve. Inactive branches are excluded. This conservative policy applies only to the new endpoint; existing feature permissions are unchanged.

Database tables/RPC are not directly available to browser roles. Service-role table privileges are SELECT/INSERT only; parent brand/branch row locks serialize initial saves and require the existing parent UPDATE privileges. Read-only verification confirmed those prerequisites on the Hub; no grants were changed there.

## Evidence foundation

`services/opportunityEvidence.mjs` validates provenance, explicit permission references, scope, dates, periods, units and metric meaning. It distinguishes measurements, feeds, discussion, seasonal context, research and hypotheses. Percentage changes require adjacent completed equal-duration count periods with compatible dataset/metric/query/geography/language/methodology. Missing values, zero baselines, ranks and rebased indices never become fabricated growth.

This is not proof of provider permission or metric correctness. Provider-specific access, semantics, retention and adapters remain gates. Corrected observations must be versioned/reconciled rather than discarded because their identity matches an earlier capture.

`services/opportunitySourceAdapters.mjs` supplies pure bridges for the existing RSS/Rising parser outputs, grounded source records and reviewed seasonal context. RSS traffic stays a raw approximate display; Rising percentages and Breakout are retained without fabricated volumes/windows. Explicit collection permission, scope, dates and retained-record references are required. These bridges are not yet connected to persistence or Radar.

`services/opportunityResearchPlan.mjs` derives bounded reviewable query themes from an approved brief's exact seeds, audience needs, offering names and active priorities. It does not infer topic fit or demand, execute queries, or combine every field into an unbounded cross-product. Duplicate literal queries retain separate provenance; provider execution will need its own deduplication policy. Unavailable/unknown offerings are research-only, not sales candidates.

## Verification

- Brief/lineage: 73 behavior tests passed.
- Storage policy and HTTP boundary: 32 behavior tests passed.
- Evidence: 29 tests; source bridges: 11; research planner: 10 passed.
- Existing Radar: 14 tests passed; Content Intelligence: 23 tests passed (including four usability wiring checks).
- Combined final targeted run: **192 passed, 0 failed**.
- Frontend TypeScript and production build passed; existing bundle/Tailwind/Browserslist warnings remain.
- `deno check --config supabase/functions/opportunity-briefs/deno.json supabase/functions/opportunity-briefs/index.ts` passed.
- Finalized migration applied twice to a fresh isolated PostgreSQL database with minimal supporting schema. SQL checks passed for append/approval history, stale predecessors, cross-scope/family rejection, partial-approval rejection, RLS and browser/service privilege boundaries.
- Two genuinely concurrent initial saves produced one snapshot and one conflict.
- Browser fixture checks passed for multiline input, save, explicit approval, readiness, history, read-only controls, missing profile, unavailable backend and mobile overflow. Requests used fixtures and external network was blocked. This does not establish live deployment/authentication correctness.

Local test commands: `npm run test:opportunity-brief`, `npm run test:opportunity-storage`, `npm run test:opportunity-evidence`, `npm run test:opportunity-research`, and `npm run test:opportunity-browser` (requires local Vite/Playwright).

Test assets:

- `tests/fixtures/opportunity-storage-bootstrap.sql` and `opportunity-storage-assertions.sql`: disposable database only, never production.
- `tests/opportunity-db-concurrency.mjs`: requires an explicitly named disposable `trellis-opportunity-test-*` container.
- `tests/opportunity-brief-browser.mjs`: requires local Vite and Playwright or `PLAYWRIGHT_MODULE`. Optional `BRIEF_SCREENSHOT` writes QA screenshots.

## Usability pass

- Empty briefs start with a short explanation and one setup action, not empty forms.
- Saved briefs open to a compact summary. Three setup steps separate Business, Goals, and Facts & review; edits survive step changes.
- Offering/audience/priority/fact editors expand individually. Evidence, drafting options, advanced settings, readiness details and history are opt-in.
- Save draft remains distinct from human approval. Fact edits still clear approval; read-only controls and server scope/version checks are unchanged.
- Content Intelligence uses four primary tabs plus More tools. Empty overviews show one next action instead of zero metrics, empty panels or developer commands.
- Content Intelligence project/tab changes confirm before discarding brief edits; reload, close setup and browser unload also guard dirty edits. This does not add an app-wide navigation blocker.
- Fixture browser checks cover compact desktop/mobile states, no horizontal overflow, retained edits, save/approval and unavailable/read-only/missing-profile states. Live authentication and deployment remain unverified.
- Empty and approved brief fixture pages fit their viewports: document height 900px at 1280×900, and 844px at 390×844. These measurements cover the brief panel, not the entire app shell.

## Production release — backend deployed

User authorized release after the usability pass. Applied only the reviewed opportunity brief migration to Switchboard-bound Hub `horvjqqifgrzxesuxtfm`; deployed only `opportunity-briefs` version 1 with JWT verification enabled. The older local Docker bundler rejected Deno lockfile v5; deployment succeeded using the documented `--use-api` server-side bundler without editing dependencies.

Live checks: brief table has RLS enabled; anon SELECT and authenticated INSERT are denied; service role has SELECT/INSERT but not UPDATE/DELETE; table has zero rows. Function is ACTIVE; unauthenticated POST returns 401 and OPTIONS returns 200. Authenticated brand reads/writes still need a signed-in smoke test. No real briefs or approvals were fabricated.

Frontend deploys through `.github/workflows/deploy.yml` on a push to main. User confirmed continuation of the requested release; commit/push is authorized. Verify GitHub deployment and the live build marker after pushing.

1. Review/apply only `supabase/migrations/20260922143248_opportunity_brief_versions.sql` to the Switchboard-bound Hub. Do not push unrelated pending migrations.
2. Deploy only `opportunity-briefs`, using its pinned Deno import map and normal user JWT verification. Never deploy with pruning.
3. Confirm unauthenticated/unauthorized failures and scoped reads before approving real facts. A test write needs explicit scope/approval.
4. Deploy the frontend only under separate explicit release authorization; a local build is not deployment.
5. Reconcile reviewer assignments and approve real briefs for diverse validation brands. LaneWise and Still Jane's Daughter lack marketing profiles; do not silently create them.

Deployment help was verified through Switchboard. After authorization, run its wrapper from this repository, not raw Supabase CLI:

```powershell
& 'C:/Users/clint/.codex/plugins/cache/personal/supabase-switchboard/0.1.0+codex.20260914213753/scripts/switchboard.ps1' supabase functions deploy opportunity-briefs --project-ref horvjqqifgrzxesuxtfm --import-map supabase/functions/opportunity-briefs/deno.json --use-api
```

## Not implemented/activated

Read-only live audit on September 22 found the **legacy** ATL Radar already enabled with automatic drafting. Its September 19 scheduled run completed with five opportunities and no run warnings; the next configured run is September 26 at 17:31 UTC. ATL is the only project with Radar settings. Existing settings/schedule were left unchanged. This is not evidence that the new brief/evidence/Jev pipeline is connected.

Activation gates for the new pipeline: approved real briefs, brand-scoped collection permissions (legacy Radar currently uses global role checks), collection bound to a pinned brief version, persisted provenance, and a bounded research-only live test. Enable scheduling only after those checks. Google Ads, GSC, Amazon and social-video providers require separate adapters and access verification.

No provider connections, Google Ads/Amazon/GSC collection, Jev opportunity evaluation, brief consumption by Radar, new scheduling, publication/event propagation or results reporting has been activated. Existing automatic-draft preferences and Radar prompts remain unchanged. The lineage helper awaits draft-version storage integration; it is not yet written to live Radar drafts.

Recovery is roll-forward: retain append-only snapshots, disable the new UI/function entry point if needed, and do not delete approved history. No destructive rollback is included.

## Lessons

Browser checks caught accessible-name problems that typechecking could not. A fresh database exposed a parent-row lock privilege prerequisite hidden by default grants in the first test database. Source adapters need real report samples and verified account rights, not merely plausible provider fields.

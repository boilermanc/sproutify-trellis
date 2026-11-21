# Newsletter staging rollout and rollback plan

Prepared 2026-11-16. **Planning only: no rollout, database change, push, email, or deployment is authorized or performed by this document.** Every operational step below is for a future, separately authorized, staging-only rehearsal. Production promotion and any actual email send require separate decisions.

The desired result is a coordinated consent and resend rehearsal with synthetic accounts, shared staff reporting intact, and zero external email delivery. Schema migrations, source settings, Trellis preview/queueing, and worker behavior must be assessed together. Do not infer staging readiness from a successful frontend build.

## Release manifest and current evidence

| Repository | Exact baseline commit | Migration owned by that repository |
| --- | --- | --- |
| Farm | `8fa18cc7144c0b93da299ccb1ec46c31e42aacc8` | `supabase/migrations/20261116122458_marketing_email_preference.sql` |
| LaneWise | `e619b392ac232322a2ce7e72315cdfa88d10ac90` | `supabase/migrations/20261116122459_marketing_email_preference.sql` |
| Trellis | `1f54bf421284547dd093868fa369d8f84a154499` | `supabase/migrations/20261115145257_newsletter_resend_safety.sql` |

Push-review provenance: `codex/newsletter-staging-safety` is based on remote main at `5d9a42b8d0759ca0d6b8575853cd119dc95e7290`. The original Trellis newsletter baseline `1f54bf4` was cherry-picked as `ad6d009462bebc323f7ae9d0a391b74e62dc1124`, followed by the staging-safety commit containing this plan. Only these two newsletter commits are added; unrelated unpushed local OneStep commits are excluded. Before rollout, pin the final reviewed branch HEAD/artifact, rather than deploying the original baseline by itself. No production deployment workflow is invoked by pushing this review branch.

Clean detached checkouts with fresh lockfile installs passed all three relevant builds, 110 Node tests, three embedded PostgreSQL suites, and three desktop/mobile browser suites. Trellis's TypeScript and Edge Function checks, Farm's targeted native component typecheck/lint, and LaneWise's full lint also passed. This is local evidence, not staging validation. Farm native device/emulator execution and LaneWise Electron packaging remain untested.

**Prepared Trellis follow-up; not deployed:** server-owned staging project manifests, binding-aware fingerprints, dedicated worker authorization, and an always-off staging dispatch gate are implemented. Pin the follow-up commit/artifact and its verification results in the release manifest before any approved rollout. No new SQL migration is needed for this follow-up; the three source/Hub migrations and their order below are unchanged. Do not substitute the original working directory's unrelated scheduler/auth changes.

Retain the clean-checkout `VERIFICATION.md` and browser evidence with the release record. Existing dependency deprecations and bundle-size warnings are not fixed by these commits. Use the same verified Node 22.18.0/npm 10.9.3 tooling for reproducibility; do not rely on unrelated working-directory files or a default production CI job.

## Gate 0: resolve blockers before integration deployment

1. **Staging targets are not established by these commits.** Record distinct staging project refs, Switchboard connections, repository bindings, frontend origins, function endpoints, backup locations, and responsible operators for all three systems. The currently registered Hub `horvjqqifgrzxesuxtfm`, Farm `qffmtkmetkfysmqmughg`, and LaneWise `imdvzbqbzcagduupydxv` are not approved staging targets. Do not use or alter them for this rehearsal.
2. **Baseline bindings require the prepared follow-up.** The original commit pins production project refs. The follow-up keeps those refs as a production validation registry, and requires server-only `NEWSLETTER_ENVIRONMENT` and `NEWSLETTER_PROJECT_BINDINGS`. Staging manifests may bind only reviewed branches to distinct isolated projects; all known production Hub/spoke refs are rejected. The runtime `SUPABASE_URL` must match the manifest Hub exactly, and each spoke connection must match its selected branch ref before retrieving a credential or creating a spoke client. Missing, malformed or omitted bindings fail closed; no environment/project fallback or browser override exists. Configure actual approved stage refs and stage-only spoke credentials, record the follow-up artifact hash, and rerun tests before integration. Until that configuration/review exists, integration is **NO-GO**; never point staging at a registered production spoke to make a test pass.
3. **Baseline worker exposure requires the prepared authorization follow-up.** The new `newsletter-worker-guard.mjs` permits only an exact dedicated scheduler token, or an Auth-verified active Trellis owner/admin/operator. Ordinary reporting staff, external/client, inactive/banned/deleted users, unverified role hints and service/public-key shortcuts are denied before provider-secret reads or queue claims. A bad scheduler header cannot fall back to an interactive session. The broader unrelated scheduler helper is not a dependency. Keep gateway JWT verification enabled; scheduler callers use target-project gateway authorization plus `x-newsletter-worker-token`, and interactive callers use their verified user JWT. This is application authorization, not trust in decoded JWT claims.
4. **The follow-up prohibits staging dispatch.** `NEWSLETTER_DISPATCH_ENABLED` must equal the string `true` AND the validated environment must be `production` for `campaign-sender` to proceed. Missing/invalid settings return 503 before privileged client construction. Staging remains blocked even with an enable flag and valid caller. This gate covers non-reminder campaigns too. There is no dry-run delivery implementation: the worker still hardcodes Resend endpoints and must be exercised only through the existing mock harness. Keep external egress blocked as independent defense for other handlers/consumers, as below.
5. **Production deployment automation is not a staging path.** Trellis's committed workflow targets its live site on main pushes/manual dispatch. Do not push, invoke that workflow, or execute the other repositories' deployment/mail scripts. A later approved staging deployment needs explicit isolated targets and credentials.

Required manifest fields before approval: release owner; Farm/LaneWise/Trellis staging project refs and Switchboard connection names; staging URLs; separately reviewed binding/auth changes; exact built artifact hashes; last-known-good stage artifact hashes; outbound isolation evidence; preflight results; backup identifiers; rollback owner; test owner; execution window. Leave the rehearsal blocked until these are filled and reviewed.

Use installed Supabase and Switchboard guidance. Resolve each owning repository's binding through Switchboard before any MCP/CLI access; verify that the selected connection and linked project both equal the approved staging manifest. Use the selected MCP connection or Switchboard CLI wrapper, never a raw linked CLI command. A registry entry without migration authority cannot apply the schema. No production connection is needed for this plan.

### Required server configuration for the follow-up

| Setting | Staging value and review |
| --- | --- |
| `SUPABASE_URL` | Approved isolated Hub HTTPS project origin, matching manifest `hub` |
| `SUPABASE_SERVICE_ROLE_KEY` | That staging Hub's existing server-only credential; never copy a production credential |
| `NEWSLETTER_ENVIRONMENT` | Exactly `staging`; absent/unknown values block both newsletter flows |
| `NEWSLETTER_PROJECT_BINDINGS` | JSON with exactly `hub` and `branches`; list only approved staging branches. Farm and LaneWise refs must be different from each other, the Hub, and every known production ref. A Hub-native branch uses literal `hub` |
| `NEWSLETTER_DISPATCH_ENABLED` | Leave absent or `false`; even `true` cannot enable staging dispatch |
| `NEWSLETTER_WORKER_TOKEN` | Optional while scheduler access is off. For an approved later scheduler setup: separately provision a random 43–128 character base64url token through the environment's secret store; do not use a Supabase key/JWT or a Vite variable. Malformed configured values fail authorization; absent token disables scheduler access while verified operators can still authenticate in an enabled production worker |
| Spoke connections and credential vault | Only approved stage project URLs and matching stage-only service credentials; consent contracts/RPC names stay unchanged |

Template only; placeholders intentionally fail validation:

```json
{"hub":"REPLACE_STAGE_HUB_REF","branches":{"sproutify-farm":"REPLACE_STAGE_FARM_REF","lanewise":"REPLACE_STAGE_LANEWISE_REF"}}
```

Do not add `verify_jwt=false`, disable source URL equality, or deploy the production registry as the staging manifest. Production bindings, if ever separately authorized, must exactly match the reviewed production registry for every enabled branch; this plan neither configures nor enables them. Existing cron calls with only a service-role Bearer token will need the dedicated scheduler header in a future coordinated authorized release. No scheduler configuration or credential was changed during preparation.

## Gate 1: establish and prove zero-email containment

Before creating synthetic Auth users, seeding campaigns, applying schema, or deploying runtime code in staging:

- Inventory and stop **all staging dispatch entry points**: pg_cron, reaper/resume jobs, n8n, application pings, direct HTTP invocations, DB webhooks, queued HTTP requests, retries, and any other email consumers. LaneWise also has welcome/lead/weekly email functions; Auth confirmations and invitations can send independently of newsletters. Do not invoke those paths to create test users.
- Block external mail-provider egress for every staging runtime, and do not load/copy live provider keys into staging, `tenant_secrets`, Vault, n8n, CI or Auth SMTP. Keep privileged worker invocation inaccessible. Prove isolation with deny-rule configuration and mock instrumentation; do not test the boundary by sending a real request to an email provider.
- Seed only synthetic `.invalid` addresses and fabricated history in isolated staging, after separate authorization. Synthetic addresses alone are not a sending control. Never clone production recipients, credentials, provider IDs, consent records or live queues into this rehearsal.
- Keep real outbox workers **off for the entire rehearsal and after sign-off**. Queueing tests may create stage-only orchestration rows once explicitly authorized and once every consumer is isolated; they must not call a live worker. Exercise dispatch behavior only in the committed mock harness, or a separately approved in-process interception environment with external egress still denied.
- Do not connect staging to existing production spokes for the other branches. Their contracts remain covered by offline fixtures unless separately isolated staging bindings are approved.

Any inability to prove these controls is a stop condition. No actual email is required to complete staging acceptance.

## Gate 2: preflight and recovery evidence

In each approved staging project, capture schema/migration history, function definitions/owners/grants, RLS policies, table grants, trigger definitions, relevant view definitions/options/grants, and extension/Postgres prerequisites. Save encrypted, access-restricted backups outside source control; logs should contain IDs/counts only, not addresses, tokens or keys. Verify the recovery procedure against a disposable staging copy.

Farm and LaneWise require the existing `auth.users` and `profiles` relationship, the referenced Auth identity/status columns, and the correct ownership/permissions for the private save helper. Verify `email_marketing_private` and Auth are not exposed Data API schemas. Check for conflicting existing objects/signatures rather than assuming `IF NOT EXISTS` proves compatibility. Missing preference rows must stay absent/default-off: no consent backfill.

Trellis requires existing campaign, send, event, suppression and staff schemas; `uuid_generate_v4()`; `private.is_active_trellis_user()` and `private.can_manage_marketing()`; and support for security-invoker views. Inspect transitive dependent reporting views and required underlying SELECT privileges. The migration changes shared grants/policies across five email tables, so review the complete affected reporting set, not just the resend modal.

Preflight the reminder unique index without exposing recipients:

```sql
-- Read-only staging preflight; duplicate groups must be zero.
SELECT count(*) AS duplicate_original_groups
FROM (
  SELECT metadata->>'resend_of'
  FROM public.campaigns
  WHERE metadata->>'resend_kind' = 'non_openers'
    AND metadata->>'resend_of' IS NOT NULL
  GROUP BY metadata->>'resend_of'
  HAVING count(*) > 1
) AS duplicate_groups;
```

If duplicates exist, stop and investigate; do not delete or relabel reminders to satisfy the index. Inventory all pending/queued/sending and legacy reminder rows, including those lacking safety metadata. They must remain quarantined; do not automatically retry them or import the November incident into the staging queue.

Record pre-migration counts and baseline access results for two active internal staff users, an ordinary non-staff user, an external/client account and inactive staff. Take timestamps and artifact checksums. No migration or runtime change proceeds on unexplained schema drift or failed backup validation.

## Ordered rollout after explicit staging approval

The source migrations are independent across projects; the order below is deliberately serial for review. There is no cross-project transaction. After each gate, stop on failure before moving to the next system.

| Step | Target and action | Evidence required before continuing |
| --- | --- | --- |
| 0 | Confirm manifest, stage-only routing, backups and outbound containment | Gates 0–2 signed; all real workers off |
| 1 | Apply only Farm `20261116122458_marketing_email_preference.sql` | Actual role/RPC/default-off checks below pass |
| 2 | Apply only LaneWise `20261116122459_marketing_email_preference.sql` | Same checks pass; independent from Farm |
| 3 | Apply only Trellis `20261115145257_newsletter_resend_safety.sql` | Source/queue RPC grants, index, triggers, shared reporting checks pass |
| 4 | Stage Trellis `newsletter-resend` endpoint and its newsletter shared modules | Authenticated preview works against approved staging-only spoke bindings; no delivery consumer active |
| 5 | Stage the reviewed follow-up worker artifact with the staging dispatch gate intact | POST returns 503 before any privileged client, secret read or outbox claim; even `NEWSLETTER_DISPATCH_ENABLED=true` remains blocked. Test positive authorization/delivery paths in mocks only |
| 6 | Stage Farm and LaneWise settings UIs against their matching stage schemas | Explicit save/reload, opt-out, wording and account-switch checks pass; no email side effects |
| 7 | Stage Trellis UI against the matching staging endpoint/schema | Fresh preview, content validation, authorization and mock queue checks pass |
| 8 | Review evidence and hold the environment | No scheduler activation, no actual email, no production promotion |

Apply each migration as a reviewed transaction in its owning project, using the authorized staging deployment mechanism and recorded timeout/lock limits. After failure verify transaction/migration-history state before any retry. Do not run a blanket `db push` containing unrelated pending migrations, and do not execute the master `SQL_SCHEMA` stamp. Earlier migration files must not be selected merely because their timestamps sort before these files: assess missing prerequisites explicitly. Rehearse idempotent reapplication in a disposable stage copy, not as a substitute for checking the actual migration history.

Keep the Trellis frontend behind its backend/schema rollout. Old source frontends remain compatible with the additive preference table because they do not enroll users; new frontends require the new version-aware RPCs. Farm web/PWA rollout must run the committed service-worker finalization and test both a fresh client and an existing cached client. Native Farm rollout stays deferred until a device/emulator check is complete. LaneWise Electron packaging is a separate, unverified release surface.

For a later approved VPS-based staging inspection, use only the manifest's staging alias/path:

```sh
# Template only; replace from the approved manifest. Do not run against production.
ssh STAGING_SSH_ALIAS
cd STAGING_RELEASE_DIRECTORY
git rev-parse HEAD
git status --short
```

No deployment/migration commands are supplied with a guessed host or project ref. Resolve the target and reviewed deployment procedure before execution.

## Consent and security acceptance matrix

| Area | Staging assertion and expected outcome |
| --- | --- |
| Default-off | Existing and newly created synthetic users load unchecked; page load, general-profile save, signup, billing and operational-alert changes create no grant |
| Explicit grant | Own-user opt-in with `farm-marketing-v1` / `lanewise-marketing-v1` persists true and server timestamps/source; repeated identical saves preserve grant time |
| Opt-out/version | Opt-out clears grant time; stale/missing wording cannot grant consent; stale stored grants resolve ineligible; stale wording must not prevent revocation through the supported server contract |
| Source isolation | User A cannot read/write B's preference, including forged expected-user IDs; manager/broker status cannot enroll B; direct table writes denied; anonymous calls denied |
| Privileged access | Source service role can read audience but cannot save/enroll through table grants or save RPC; private definer helper verifies Auth actor, fixed search path and current wording; no unexpected EXECUTE grants or exposed private schema |
| Auth identity | Unverified, mismatched profile/Auth email, banned or deleted users excluded; Farm also requires active profile flags; operational subscription/account status alone never grants consent |
| UI failure | Missing RPC, read/save error and account-switch races never show a guessed opt-in or false success; duplicate clicks cannot create duplicate saves/submissions; stale UI instructs refresh/reload |
| Hub vetoes | Positive native consent never overrides Hub pause/unsubscribe/status or global/business suppression; missing source data, credentials or count is an error, not an empty successful audience |
| Stable identity | U+200D subject difference does not alter attribution; missing/zero/wrong/multi-business campaign IDs fail; mismatched provider IDs and incomplete engagement coverage fail |
| Environment isolation | Missing/invalid config and wrong Hub URL block before source access; every known production ref is denied in staging, including under another branch name; unknown/omitted branches, duplicate projects and production cross-business mappings denied; actual Farm/LaneWise staging connections retain their native consent RPCs |
| Zero opens | Complete successful fixture history with actual zero recorded opens may preview; missing/failed/expired event coverage must stop. Explain that no recorded open does not establish no reading |
| Preview | Correct selected original, total sent, exclusion reasons, final count and opaque small sample; no email/token exposure; missing/expired/forged preview or changed subject denied |
| Revalidation | After preview, change opt-in, unsubscribe, suppression, open history or same-count membership: queue request must require a new preview. Changing selected environment/Hub/spoke binding also changes the fingerprint, even with identical recipients/counts. Worker mock must stop on these changes and altered outbox fields |
| Pagination | Capped short pages still read to exact total; failed/missing/changing counts and incomplete pages fail closed |
| Content | Literal `[DATE]`, encoded/formatted placeholders and unsupported merge fields block; supported merge fields render and final output is checked |
| Idempotency | Concurrent duplicate requests create one reminder/outbox; a repeat reminder is rejected; source-change failure leaves no half-queue; mock provider-acceptance/attribution failure retries identical per-recipient key/payload; >23-hour reminder retry blocked |
| Staff reports | Two distinct active internal staff users retain shared reports for colleagues' campaigns, ownerless legacy campaigns and unattributed transactional events; they are not restricted to row ownership |
| Staff writes | Ordinary staff cannot resend another owner's campaign; owner/admin/operator can act only through verified server authorization and exact selected campaign/business binding; role hints in request bodies have no effect |
| External boundary | Anonymous, external non-staff/client and inactive identities denied direct tables, dependent views and service-only source/enqueue RPCs; wrong original/business never exposes another audience |
| Secrets/privacy | No service keys in Vite bundles, mobile packages, browser requests, logs or reports; source/Hub Auth keys isolated by environment; log errors contain no recipient data or provider response bodies |
| Worker authorization | Invalid/missing scheduler header, public/service-key shortcuts, ordinary staff, external/client, inactive/banned/deleted users, Auth or membership read failures denied before secrets/outbox. Exact scheduler header and Auth-verified active marketing operators pass only in the production-mode mock. OPTIONS 204 and unsupported methods 405 make no Auth or dispatch calls |
| No delivery | Zero real provider calls, zero scheduler/worker activations, no Auth/welcome/lead/weekly email side effects; mock assertions show zero sends on every failure case |

Run existing source SQL/unit/browser harnesses and Trellis resend/campaign/SQL/worker/browser checks against the final reviewed stage artifact. Endpoint queue tests, if separately authorized, use only synthetic staging rows with all consumers isolated. Never call production or the real provider to prove a successful test. A denied request must leave zero new queue rows; do not require a particular HTTP status where the committed handler returns a generic validation error.

The expanded `npm run test:newsletter-resend` includes `newsletter-project-bindings.test.mjs`, `newsletter-worker-guard.test.mjs` and `newsletter-resend-endpoint.test.mjs`. The worker integration harness now runs the real dedicated authorization module rather than replacing it with an always-allow stub. The real endpoint wrapper is tested for clear 503 responses on missing configuration before client/Auth/source access, and for ignoring request-supplied project/environment overrides. Deno checks cover both endpoint entrypoints. Rerun clean-artifact verification after pinning the follow-up revision.

Local follow-up verification on 2026-11-16 passed: 106 resend/security tests plus 21 campaign tests (127 total), the embedded SQL permission/migration suite, both Deno entrypoint checks, TypeScript and the Vite production build. The final code was also checked as a 17-file task-only overlay on a clean `1f54bf4` baseline with its independently lock-installed dependencies; unrelated source/guard changes were absent. No new dependency was added. This evidence is for prepared local code, not an applied staging deployment. Existing mixed-import/chunk-size build warnings remain.

## Stop conditions and monitoring

Stop immediately for any target mismatch, external provider request attempt, unauthorized row visibility/write, shared staff reporting regression, unconfirmed consent acknowledgment, unexpected positive consent, partial migration, invalid index, unexplained queue mutation or inability to verify engagement completeness. Missing Farm/LaneWise RPCs must leave only those branches blocked, never broaden their audience.

Observe redacted status/count summaries: preference saves versus failures, source/RPC errors, preview counts/exclusions, queue uniqueness, authorization denials, unchanged real-delivery counts, and schema/version checks. There is no built-in audit stream promised by these commits; use fixture instrumentation and approved staging access logs. Record findings before resuming another gate.

## Rollback and recovery

Rollback means **contain, preserve consent/security, and repair forward**. It does not mean restoring the subject-matching sender or dropping the new tables. There are no reviewed destructive down-migrations in these commits.

| Failure point | Safe staging response |
| --- | --- |
| Source migration fails | Stop that project's rollout; verify transactional rollback and migration-history state. Leave other successful additive schemas intact; keep Trellis integration blocked. Repair and rehearse only the failed stage migration |
| Source UI fails after migration | Restore the recorded last-known-good staging UI artifact while retaining consent table/RPC/audit data. Keep marketing disabled. Preserve a working authenticated opt-out path, or keep all affected marketing off until the preference UI is repaired |
| Trellis migration/reporting fails | Keep worker/endpoint/UI unavailable. Restore required staff reporting through a reviewed repair that retains active-staff restrictions and invoker views; do not regrant anonymous access or restore owner-only reporting restrictions |
| Endpoint/preview fails | Remove public access to the staging endpoint and resend action; retain schema protections/unique index. Leave queued rows quarantined with IDs/statuses intact. Do not switch back to client-provided audiences |
| Worker/authorization fails | Keep invocation and provider egress blocked. Retain known queue/provider attribution evidence; repair the caller/validation boundary. Never retry or delete/recreate a reminder to bypass uniqueness or the 23-hour retry window |
| Unsafe exposure/delivery attempt | Stop the rehearsal and isolate affected staging endpoints/credentials using the approved incident procedure. Reconcile queue and mock records; do not assume a timeout means no side effect. No production action is authorized by this plan |

Before any restore, preserve the latest consent choices, revocations, wording versions and timestamps. An older snapshot may resurrect an opt-in or lose an opt-out; never blindly overwrite current preferences with it. Any necessary recovery must conservatively preserve/replay revocations under reviewed rules and keep marketing off until reconciled. Never backfill true, infer consent from billing/alerts, remove suppression rows, drop the reminder index/triggers, or rotate a production service key to invalidate a staging preview. Stop staging queue access and let signed previews expire after ten minutes; re-preview after repair.

Binding/fingerprint rollback also requires reconciliation: the follow-up changes the reminder fingerprint context. Older queued fingerprints deliberately fail worker revalidation. Do not rewrite hashes, change a stage environment to `production`, remove the dispatch gate, restore the unguarded baseline worker, or recreate an old reminder to make it resume. Keep dispatch off and preserve duplicate/retry evidence. A manifest/authorization regression should be repaired forward with reviewed server configuration/code while retaining the restrictive database protections.

For a broad schema recovery, use the recorded staging backup only in an isolated recovery copy first. Compare grants, dependent view options and policies against the baseline, then prepare the smallest secure forward repair. Generic reverse-DDL cannot reconstruct prior grants/view semantics and may destroy consent evidence. Coordinate with the rollback owner; do not restore production or copy staging state to it.

## Sign-off and handoff

Release owner and security/consent reviewer must record: exact artifacts and stage refs; applied migration versions/checksums/order; backups and tested recovery identifiers; pass/fail evidence for every matrix row; unresolved limitations; and proof that all outbound controls remain in place. Farm mobile owner separately signs the device/emulator result before native release; LaneWise desktop packaging has its own gate.

Staging success ends with schedulers still off and no actual email sent. Any next production rollout, push/deployment, production migration/data change, scheduler enablement or actual email requires a new explicit authorization and an exact target review. Do not retry the November 14 reminder or treat this rehearsal as approval to send it again.

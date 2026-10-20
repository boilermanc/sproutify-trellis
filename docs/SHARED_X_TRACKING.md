# Shared X tracking — @boilermanc

Social Hub → **X tracking · @boilermanc** tracks one account across all projects.
This view deliberately ignores the global branch selector. Active Trellis owners
and admins can access it; branch-limited users cannot access cross-project data.
The shared connection is separate from the older branch-based X publishing wizard.

## Daily use

Connect @boilermanc, authorize the popup, close it, and select **Refresh**.
**Sync now** collects new posts and mentions, including posts written directly
on X. Initial import requests the last 30 days, subject to X's timeline availability.
Large imports continue across scheduled runs (up to two pages per timeline/run).
Posts remain stored after the initial window.

Use **Own posts** or **Mentions** and filter by any project or **Unassigned**.
Select multiple project checkboxes and **Save tags**. Tags are explicit branch IDs,
not inferred from post text. New posts start unassigned; sync never overwrites tags.
Mentions can be marked handled and reopened. No replies are sent.

**Daily metrics** shows the latest 31 stored daily snapshots for a post. These are
lifetime impressions, likes, replies, reposts, quotes, and bookmarks at capture
time, not daily gains or unique viewers. A missing metric displays “—”, never zero.
Own posts are refreshed daily for their first 30 days; mentions get a snapshot
when collected. One row per post/UTC day is updated to the latest capture that day.
No historical daily series can be reconstructed before collection began.
Click/private metrics, automatic attribution, publishing, and Sage context are
outside this increment. Spoke customer profiles are not read or stored.

## Deployment status — October 20, 2026

User-approved backend release completed on Hub `horvjqqifgrzxesuxtfm`:

- Migration `20261020140327_shared_x_tracking` applied. The local migration filename
  matches the version assigned by the migration service.
- `x-tracking` version 1 is ACTIVE with internal authorization and a public OAuth callback.
- Verified all four tables have RLS enabled, no anon/authenticated SELECT grants,
  and service-role access. The singleton is @boilermanc and remains unconnected.
- Live checks: OPTIONS 200, unsupported GET 405, unauthenticated POST 401,
  invalid OAuth callback 400. No X-table security advisory was reported.
- All three X server secrets are configured. OAuth connection, real-data collection, frontend
  release, and scheduler activation remain pending. No X API requests were made.

Only new tables/functions were introduced; existing records were not modified.
Recovery is to disable the new collector/function and retain its tables. No
destructive rollback or whole-Hub restore is needed for this additive release.

## Activation prerequisites

Target: Switchboard `sproutify-trellis`, Hub `horvjqqifgrzxesuxtfm`.
No spoke writes. The backend is deployed; the frontend changes remain local.

1. Apply **only** `supabase/migrations/20261020140327_shared_x_tracking.sql`.
   Do not push unrelated pending migrations. The Schema Engine imports this exact
   file into `SQL_SCHEMA` to keep a single authoritative definition.
2. In X Developer Console, configure a confidential OAuth 2.0 web application.
   Set this exact callback:
   `https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/x-tracking/callback`.
   Required scopes: `tweet.read users.read offline.access`. No write scope.
3. Configure server secrets using the approved secure secret-management flow:
   `X_CLIENT_ID` (OAuth 2.0 client ID, not the API key), `X_CLIENT_SECRET`,
   and a random `X_TOKEN_ENCRYPTION_KEY` of at least 32 characters.
   Never place these in frontend environment variables, Git, or command output.
   Keep the encryption key stable; losing/changing it requires reconnecting.
4. Deploy `x-tracking` with gateway JWT verification disabled because X's callback
   has no Supabase JWT. POST actions explicitly verify an active owner/admin via
   `requireTrellisUser`. Only sync accepts the Hub service-role bearer. The callback
   consumes an expiring, single-use state and uses PKCE S256 before verifying X identity.
   Use the Switchboard wrapper from this repository:

   ```powershell
   & C:/Users/clint/.codex/plugins/cache/personal/supabase-switchboard/0.1.0+codex.20260914213753/scripts/switchboard.ps1 supabase functions deploy x-tracking --no-verify-jwt
   ```

5. Deploy the frontend using the existing approved hosting workflow.
6. Connect as @boilermanc in Social Hub. Other handles or a changed numeric X user
   ID are rejected. The browser never receives access or refresh tokens.
7. Set a spending limit in X Developer Console. X meters API resources; polling
   limits are not a dollar cap. Verify current costs there before activation.
8. Import `n8n-blueprints/X1-shared-account-tracking.json` (inactive by default).
   Select the existing Trellis Hub Supabase server credential, ensuring the HTTP
   node sends `Authorization: Bearer <service-role key>`. Run once manually,
   verify the resulting posts and snapshots, then activate the 30-minute schedule.
   Workflow execution payload storage is disabled. Configure n8n failure alerts
   through the existing operational process.

Verify: account identity, native-X post import, an actual mention, saved multi-project
tags after another sync, daily snapshots on the next UTC day, background token
refresh, and rate-limit/credit errors. Confirm unauthorized roles receive 401/403.
The local tests do not prove live X access, billing eligibility, or production setup.

## Recovery and limits

Pause the n8n workflow to stop automatic reads/costs. Preserve tracking tables
and snapshots when rolling back the frontend/function. The migration is additive.
Use the Hub's backup/recovery process for future destructive changes; do not drop
stored data as a routine rollback.
Reconnect on revoked authorization. Tokens refresh under a database lease; timed-out
leases expire in four minutes. A run stops collecting after its time budget and
resumes saved pagination later. Missing/private/deleted posts retain their last
metrics with an availability notice, without inserting fabricated snapshots.

Timeline errors do not advance the cursor. Successful pages are retained, so retry
may repeat a page but cannot duplicate a post or daily snapshot. Very large backlogs
may take multiple runs; current API availability limits still apply. Content deletion
compliance and retention should be reviewed before broadening to public listening.

## Local verification

```powershell
node --test tests/x-tracking.test.mjs
npx tsc --noEmit
deno check supabase/functions/x-tracking/index.ts
npm run build
# With Vite on port 3015 and Playwright installed or PLAYWRIGHT_MODULE configured:
node tests/x-tracking-browser.mjs
# With PGlite installed or PGLITE_MODULE configured:
node tests/x-tracking-sql.mjs
```

The browser fixture `/tests/fixtures/x-tracking.html` uses synthetic data and blocks
external calls in its test runner. SQL tests use an isolated PGlite database,
not the Hub. They apply the new migration twice; they do not stamp the entire
legacy master schema. Tests cover account identity, authorization, PKCE state
consumption failure, pagination, metrics, encryption, leases, tags, daily
snapshot uniqueness, mobile layout, and user-visible API failures.

Implementation lesson: a shared social identity needs its own account-level
collection cursor. Project tags belong to posts and must survive every ingestion
upsert; assigning one credential per project would duplicate collection and costs.

# Profiles: signup and subscriptions

In Profiles → Live Spokes, select Rekkrd or another branch. Signup & plan shows
the source profile's creation date, current plan, source subscription status,
and period end. Open a profile for its subscription history. Plan and activity
filters combine with search; sort by signup date, plan, activity, or period end.
The result count and pagination apply after filtering and sorting.

Rekkrd's saved subscription mapping already supplies plan, status, user_id,
created_at, current_period_start and current_period_end. All branches use their
enabled subscription table mappings; sources without these fields display
Unknown. Profile signup and subscription creation are separate dates. Some
commerce-only identities use their first order date as profile creation in the
existing connector, so that date is not a verified account signup.

Subscription activity is distinct from marketing email consent and app usage.
Active/trialing/trial records count as active unless their period has ended or
their start is in the future. Expired, canceled/cancelled, unpaid, paused and
incomplete_expired count as inactive. Other statuses, absent subscriptions and
invalid dates stay unknown. A missing period end does not invent an expiry.
Period ends can renew and do not establish a scheduled cancellation.

The display prefers a currently active subscription, then the newest creation
date, falling back to period start. The drawer retains every matched record.
Records match customer ID first, then normalized email, within the same spoke.
Subscription read failures appear in the existing federation error banner.
Data stays transient in the existing branch statistics state; there are no
Hub profile writes or spoke writes.

Local checks: `node --test tests/profile-subscriptions.test.mjs`,
`npx tsc --noEmit`, and `npm run build`. With Vite running, open
`/tests/fixtures/profiles.html` for a synthetic desktop/mobile preview with
multiple plans, activity states, missing records, and multiple result pages.
Run `node tests/profile-subscriptions-browser.mjs` for filters, sorting,
pagination, drawer and mobile overflow assertions; set `PLAYWRIGHT_MODULE`
if Playwright is installed outside the project, and `STUDIO_TEST_URL` to
override the default `http://localhost:3016` preview origin.

## Rekkrd record counts and live verification — 2026-11-11

Records added counts current rows in Rekkrd `albums`, grouped by `user_id`.
Each copy is one record, regardless of format. Deleted records are not included;
this is the current collection size, not a lifetime count of additions. Sort
profiles by Records added: most first. Zero means the collection read succeeded
but that user has no records. A failed, malformed, or wholly empty/inaccessible
source read stays Unknown and produces a federation error.

The authenticated `spoke-query` collection_counts operation permits only the
fixed registered Rekkrd project and reads only album IDs and owner IDs with
stable ID pagination. It returns owner counts, not album metadata. It uses
the existing server-only spoke key. No credentials reach the browser and no
profile or album data is written into the Hub.

The same backend change adds trial_start/trial_end, provider, iap_status and
iap_current_period_end to the fixed Rekkrd subscription read. Trial end takes
precedence over billing-period end for trialing records. App Store status and
end date apply only when provider=app_store; unrelated sandbox IAP fields do
not override another provider. These source values describe subscription
activity, not verified payment receipts or an application entitlement decision.

Read-only live source queries confirmed 78 profiles, all with signup dates
and subscriptions; 26,573 album records; 40 collectors with records; 38 profiles
with zero records; largest collection 7,176. No album owners or subscription
users failed the profile-ID join. Running the production date/status helpers
against anonymized live per-profile values classified 53 as active and 25 as
inactive at verification time. Nineteen source rows were still trialing despite
their trial end having passed. Six expired subscriptions retain a known trial_end and show that trial date
when no billing-period end exists. Two active subscriptions have no applicable
end date; the UI preserves Unknown for those dates. An old trial date does not
override an explicitly active non-App-Store grant. These totals can change.

Publishing requires explicit approval for the Trellis hub `spoke-query`
deployment and matching frontend release. No DB migration or mapping write is
needed. The changes retain unrelated existing edits in the function. Review
the complete function diff before release; it contains earlier local work too.
The pre-existing TS2589 in the snapshot newsletter count query was fixed by
normalizing its dynamic subscribed-column name to a string before calling eq.
The complete spoke-query Deno check now passes. After deployment, compare
the authorized Profiles UI and its gateway response against fresh source totals,
including a zero-count profile, an expired trial and an App Store subscription.
Source database verification does not verify the deployed gateway or browser.
Recover by restoring the previous function/frontend artifacts if release fails;
no database data changes need rollback.

## Release status — 2026-11-11

Trellis hub spoke-query version 39 is deployed with verify_jwt=true and the
existing deployed internal-user guard unchanged. An unauthenticated collection
count request returned HTTP 401. The previous version 38 source is preserved
outside Git in the current chat artifact directory for rollback. Frontend
release preparation uses an isolated checkout of deployed main 96606dd; only
Profiles UI, count/subscription helpers, relevant types, tests and this guide
are included. The user approved the scoped frontend commit and push to main
to trigger the existing GitHub Actions deployment. No data, credentials or mappings changed.

Live frontend verification after the first deployment matched all 78 rendered
rows to the source aggregates: 26,573 records, 38 zeros, max 7,176, 53 active
and 25 inactive. The expired-trial date fallback was then corrected so six
known historical trial dates are preserved. The first release commit was
877ee15 and GitHub Actions run 43073035011 succeeded.

Missing names are normalized before profile enrichment. Desktop rows, mobile
cards and the detail drawer use a shared display helper: valid name parts first,
then the full email address. Null, blank, and serialized null/undefined names
are treated as absent. Avatars use the first letter of that same display value.
Check with `node --test tests/profile-identity.test.mjs` and the browser fixture.

## Empty-collection onboarding audience

Profiles → Live Spokes → Rekkrd → Collection → No records yet filters only
confirmed zero counts. Has records and Count unknown are also available. The
filter combines with search, plan and activity, and resets pagination. An empty
collection means no records currently stored; a user who deleted their collection
also qualifies. Unknown/failed counts never qualify as zero.

For an onboarding campaign, select Rekkrd in Campaign Builder, then the saved
audience “Rekkrd: No records yet”. The same preset is available on Segments,
where Send Campaign uses the existing handoff. Segment membership is evaluated
from the latest loaded federated counts; refresh Profiles before reviewing a
campaign. Consent and suppression checks still apply, so the sendable count can
be lower than the Profiles count. Nothing is sent by using the filter or preset.
The shared segment field Records Added (current collection) also supports
custom numeric rules; unavailable counts fail all collection rules. The preset
is appended to preserve existing preset IDs. Tests: profile-collection.test.mjs
and the expanded profile-subscriptions-browser.mjs fixture.

Deployment recovery: GitHub returned internal startup failures before creating
any jobs for the onboarding release. The deployment concurrency group was
renamed from deploy-trellis to trellis-production-deploy to avoid the stuck
queue state, retaining cancel-in-progress and single-group serialization.
The documented production SSH command is `ssh -p 2222 sproutify-prod`; the
endpoint timed out before authentication from this environment during recovery.

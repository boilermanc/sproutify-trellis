# PostHog → Trellis Runbook

## Data boundary

- PostHog owns raw events, sessions, autocapture, and replay data.
- App Supabase projects own their operational profiles and app data.
- Trellis stores hourly aggregate snapshots and approved lifecycle/milestone events only.
- RevenueCat or the app billing system remains authoritative for subscriptions and purchases.

## Deploy the Hub foundation

From the server that deploys the Trellis Hub:

```bash
ssh your-server
cd /path/to/sproutify-trellis
git pull --ff-only
npx supabase db push
POSTHOG_CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 48)"
POSTHOG_REFRESH_SECRET="$(openssl rand -base64 48)"
npx supabase secrets set POSTHOG_CREDENTIAL_ENCRYPTION_KEY="$POSTHOG_CREDENTIAL_ENCRYPTION_KEY" POSTHOG_REFRESH_SECRET="$POSTHOG_REFRESH_SECRET"
npx supabase functions deploy posthog-connections
npx supabase functions deploy posthog-analytics
npx supabase functions deploy posthog-ingest --no-verify-jwt
npx supabase functions deploy posthog-refresh --no-verify-jwt
npm run test:posthog
npm run build
```

Store the generated encryption key in the deployment secret manager before ending the shell session. Losing or changing it makes existing PostHog personal API keys unreadable; rotate and re-save each connection if that happens.

`posthog-connections` and browser calls to `posthog-analytics` use normal Supabase JWT verification plus an explicit `auth.getUser()` check. `posthog-ingest` and `posthog-refresh` intentionally disable gateway JWT verification because they verify their own dedicated bearer/header secrets. The refresh function invokes the protected analytics function internally with the Hub service role and refresh secret.

## Import the n8n gateway

1. Import `n8n-blueprints/B6-posthog-event-ingest.json` and `n8n-blueprints/B7-posthog-hourly-refresh.json` into n8n.
2. Replace `YOUR_HUB_PROJECT` in each HTTP Request node. B6 does not need a Supabase API key because `posthog-ingest` verifies the forwarded PostHog bearer secret itself.
3. Keep response mode set to the final HTTP node so PostHog receives non-2xx errors and performs its retries.
4. Do not add request-body logging. The Edge Function rebuilds a safe envelope, but the n8n ingress initially receives the source request.
5. Activate the workflow at:

```text
https://n8n.sproutify.app/webhook/posthog-event-ingest/:connection_id
```

For B7, update `YOUR_HUB_PROJECT`, create an **HTTP Header Auth** credential named `x-trellis-refresh-secret` with the same value deployed as `POSTHOG_REFRESH_SECRET`, and activate the schedule. It refreshes 7-, 30-, and 90-day snapshots at five minutes past each hour.

## Connect Rejoice

1. In Trellis, open **Settings → Integrations → PostHog Product Analytics**.
2. Select the Rejoice branch, region, project ID, and PostHog personal API key.
3. Review the event and categorical-property allowlists, then click **Test and save**.
4. Copy the one-time webhook secret and URL before closing the setup dialog.
5. In PostHog, create a realtime Webhook destination and add the displayed `Authorization` header.
6. Filter the destination to exactly the event names displayed in Trellis.
7. Use this custom payload:

```json
{
  "event_id": "{event.uuid}",
  "event": "{event.event}",
  "distinct_id": "{event.distinct_id}",
  "timestamp": "{event.timestamp}",
  "properties": {event.properties}
}
```

Trellis always drops keys resembling journal, prayer, mood, emotion, faith, free text, URLs, contact fields, or secrets—even if they are accidentally added to the connection allowlist.

### Rejoice canonical transition

Rejoice accepts its canonical guest-first lifecycle, marketing, and monetization UX events. It never accepts prayer, journal, devotion content, raw feelings, names, email, URLs, referrers, promo text, or campaign URLs. `custom_feeling` is accepted only as a boolean classification.

Unlike older spoke templates, the Rejoice destination must omit `email` and the
entire PostHog `person` object. The Hub also forces Rejoice email to `null` at
ingestion as a defense in depth.

For 14 days, query `user_signed_up` alongside `Application Installed` and `onboarding_completed` alongside `$identify`. Switch reporting to canonical signals when coverage is at least 95%, retain legacy diagnostics for another 30 days, then remove the proxy mapping. Completion and activation can precede signup, so all lifecycle stages are independent counts rather than a strict ordered funnel.

RevenueCat remains revenue truth. Rejoice's `purchase_started` and `plan_selected` describe paywall UX only. Display calendar periods in `America/New_York`; compute 24-hour and 168-hour activation windows as elapsed UTC time. Filter internal UUIDs, development, previews, and TestFlight from production dashboards.

Feeling-cohort data may enter Trellis only from Rejoice's protected aggregate view: rolling 30/90-day buckets, minimum group size 10, and no UUIDs, study IDs, custom text, or devotion content.

## Connect Rekkrd

Connected and verified on 2026-09-12. Hub connection ID:
`6397b187-6aab-44c7-8274-99ba0d122ad8`. The first live 30-day snapshot at
15:06:47 UTC returned 6 daily/weekly/monthly active users and 5 sessions, with no
connection error. Reports → Product was also verified with scope set to Rekkrd.
The encrypted credential is restricted to Query Read for this project.
Realtime webhook forwarding is not enabled.

Rekkrd uses US Cloud (`https://us.posthog.com`), project **605974**, and the existing
`rekkrd` Trellis branch. Its public `phc_` SDK token is only for event capture.
Trellis queries require a personal API key restricted to the Rekkrd project with
**Query Read** permission ([PostHog query prerequisites](https://posthog.com/docs/api/queries)).
Enter that key directly in the connection form; do not commit it to source.

1. Open **Settings → Integrations → PostHog Product Analytics → Connect branch**.
2. Select **Rekkrd**. The form supplies the shipped product event/property defaults.
3. Choose **US Cloud**, enter project **605974** and the personal API key, then **Test and save**.
4. Open **Reports → Product Analytics**, choose Rekkrd, and refresh the 30-day report.

The preset accepts `signup_completed`, `first_record_added`, `discogs_connected`,
`discogs_import_completed`, `collection_value_viewed`, and `third_spin_logged`.
Only `platform`, `surface`, `placement`, and numeric `value` are approved properties.
`signup_completed` counts as a signup; `first_record_added` counts as activation.
The remaining events are feature milestones. Rekkrd does not currently emit a
separate onboarding-completion event, so that stage remains zero until instrumented.

Start with aggregate reports. Rekkrd identifies PostHog users by Supabase UUID and
does not send email. The current webhook ingester matches Hub profiles by email,
so these events cannot yet drive email-matched profile automation. Do not add
emails or copy profiles into the Hub merely to enable analytics.

### Maintaining branch mappings

Before redeploying, compare the live functions with the repository. The live
Rejoice analytics function previously used an install/identity proxy absent from
local source. `posthogLifecycleForBranch()` now preserves that proxy only for
Rejoice, including its Installed/Identified labels. Other branches use canonical
lifecycle events, including Rekkrd's aliases. Contract tests cover this separation.

## Ask Sage about connected properties

Sage discovers PostHog connections on each product-analytics question. Existing
and future connected branches use the same protected `posthog-connections` and
`posthog-analytics` endpoints as Reports. No new credential, database migration,
or Edge Function deployment is required for the Sage reader. The frontend change
uses the normal Trellis build and deployment process.

Try:

- “How are all PostHog properties doing?”
- “Compare Rekkrd and Rejoice retention.”
- “Show Rekkrd usage over 7 days.”
- “What about Rejoice?”
- “Which features are being used in Rekkrd?”

Questions use the selected branches unless they explicitly name branches/projects
or request all properties. Follow-ups remember the last product scope, topic, and
window. Changing the branch selector or asking an unrelated question clears that
context. An empty selection never silently expands to all properties.

Each answer identifies its project and snapshot timestamp, marks stale data, and
keeps successful branches visible when another query fails. Supported windows are
rolling 7, 30, and 90 days. Daily/weekly/monthly active-user metrics always use
1/7/30 days, independently of the selected window. Projects are not deduplicated
across branches.

Interpretation safeguards:

- Lifecycle stages count distinct IDs independently; their ratios do not prove a
  sequenced signup-to-activation conversion funnel. Rejoice temporarily counts
  canonical and legacy proxy signals together during reconciliation.
- Repeat activity measures the overlap between adjacent 7- or 30-day periods,
  rather than exact day-7/day-30 signup-cohort retention. Empty previous periods
  mean insufficient history. `users.returning` is not used as a repeat-user count.
- `users.new` counts signup/install events, not first-seen visitors.
- Missing fields are unavailable, and an empty feature list does not prove that
  nobody used those features. Only approved milestone names are displayed.
- Custom date ranges, historical comparisons, arbitrary property breakdowns,
  individual-user details, and revenue attribution need a separate PostHog report.

The deterministic reader does not send analytics or connection metadata to an
LLM and does not store raw events or profiles. Sage's existing email and ATL event
readers remain in place. The launcher is also available on narrow screens.

Validate with `npm run test:sage`, `npm run test:posthog`, `npx tsc --noEmit`, and
`npm run build`. In the signed-in app, open Sage and ask the first three questions
above, then compare the answers with Reports → Product using the same window.

Sage verification on 2026-09-12: 24 Sage tests and 9 PostHog contract tests passed,
with no TypeScript errors. A reader smoke test against the Hub's live 30-day
aggregate snapshots returned Rejoice's 68 monthly active IDs / 79 sessions and
Rekkrd's 6 / 5, preserved Rejoice's lifecycle proxy labels, and correctly reported
insufficient prior-period history for Rekkrd retention. The rendered Sage chat
still needs UI verification: the signed-in in-app browser automation timed out.

## Verification

Run these checks after the migration and functions are deployed:

```bash
# Must return 401 because no PostHog bearer secret is present.
curl -i -X POST \
  "https://YOUR_HUB_PROJECT.supabase.co/functions/v1/posthog-ingest" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"connection_id":"00000000-0000-0000-0000-000000000000"}'

# Local contract and production build checks.
npm run test:posthog
npm run build
```

In the Trellis UI:

- Test the Rejoice connection and confirm the key remains masked after reload.
- Open Reports and compare the 30-day figures with PostHog using the same project timezone.
- Send the same PostHog test event twice and confirm one `marketing_events` row and one `processed_events` marker exist.
- Confirm an anonymous event does not create a Hub profile.
- Temporarily invalidate the PostHog key and confirm Reports shows the last snapshot with a stale badge.
- Inspect `marketing_events.payload` and `failed_syncs.raw_payload` to confirm no unapproved or sensitive properties crossed the boundary.

Keep the Rejoice pilot aggregate-only for one week. Enable the realtime destination after the dashboard figures match PostHog, then repeat the same per-branch connection flow for other apps.

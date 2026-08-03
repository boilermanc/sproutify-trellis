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
  "email": "{person.properties.email}",
  "properties": {event.properties}
}
```

Trellis always drops keys resembling journal, prayer, mood, emotion, faith, free text, URLs, contact fields, or secrets—even if they are accidentally added to the connection allowlist.

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

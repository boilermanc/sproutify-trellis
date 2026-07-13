# ATL Subscription Verification - 2026-07-13

## Summary

Sheree's ATL subscriber reorg is not fully reflected in Trellis yet.

The ATL source of truth is now `newsletter_subscribers.status`, where only
`status = 'active'` is mailable. Trellis was still reading
`customers.newsletter_subscribed`, which is deprecated.

## Live Findings

- ATL connection: `ATL Urban Farms`
- ATL spoke project: `povudgtvzggnxwgtjexa`
- Trellis configured customer table: `customers`
- Trellis configured subscription field: `customers.newsletter_subscribed`
- Trellis runtime customer fetch:
  - total customer rows: 5,872
  - `newsletter_subscribed = true`: 4,761
  - `newsletter_subscribed = false`: 1,111
- ATL authoritative newsletter RPC:
  - `resolve_newsletter_audience(p_tags := null)`: 5,603 active rows

These counts do not match, so Trellis campaign audience and profile consent
badges were not aligned with ATL's current model.

## Code Change

The Trellis connector now supports an ATL newsletter audience path:

- `supabase/functions/spoke-query/index.ts`
  - Adds runtime op `newsletter_audience`.
  - Uses the saved spoke connection key server-side.
  - Calls ATL `resolve_newsletter_audience`.
  - Paginates through all active subscriber rows.
- `spokeConnector.ts`
  - Fetches ATL active newsletter rows in parallel with customers/orders.
  - Overrides ATL customer `subscribed` from the active newsletter email set.
  - Adds active subscriber-only emails as profiles.
  - Stops defaulting ATL order-only identities to subscribed unless they are in the active newsletter set.
  - Falls back to existing behavior if the new Edge Function op is not deployed yet.

## Deployment Blocker

Deploying the updated `spoke-query` Edge Function failed with Supabase 403:

```text
unexpected list functions status 403
Your account does not have the necessary privileges to access this endpoint.
```

Until someone with Supabase function deploy permission deploys `spoke-query`,
live Trellis will continue falling back to the old customer-field behavior.

## Verification After Deploy

Run a live invocation of `spoke-query` with:

```json
{
  "op": "newsletter_audience",
  "connection_id": "ca3c17c5-d35d-44b6-8738-61b23f8d66e7"
}
```

Expected result:

- `rows.length` across all pages: 5,603
- Campaign Builder ATL branch audience should use those active newsletter emails as the consent gate.

# Trellis Business Overview — Audited Implementation Plan

Date: September 20, 2026  
Status: Phase 1 read-only audit complete; application implementation has not started.

## Outcome

Clint and Sheree should open Trellis and understand the businesses in five minutes: registrations, new paying customers or first-time buyers, expired trials, and trials ending soon. Immediately below those numbers, Trellis should offer no more than three prepared actions that fit an adjustable two-hour combined weekly budget.

The business summary belongs at the top of the existing pinned **Overview** destination. It must not become another nested dashboard.

## Phase 1 findings

### Repository and routing

- `App.tsx` initializes `activeView` to `dashboard`; `components/Layout.tsx` pins that destination as **Overview**.
- `pages/Dashboard.tsx` defaults to the **Control Room** tab and also exposes **Morning Standup** and **Branch Board**.
- The global branch picker already scopes the dashboard. The initial and “all selected” states expand to every active branch; an empty selection remains empty.
- Supabase Switchboard resolves this repository to the Trellis Hub (`sproutify-trellis`) by default. `atl` and `sproutify` are declared read-only secondary connections with no migration authority.
- The live Hub branch registry currently contains ten active branches. Seven have active spoke connections; SpectIQ, Still Jane's Daughter, and Sweetwater Urban Farms do not.
- The existing `spoke-query` Edge Function keeps spoke credentials server-side and returns rows plus configured field mappings. This is the right boundary to extend or sit behind a protected aggregate reader.

### Existing metric behavior

- `WindowTotals` currently contains revenue, posts published, new profiles, and email open rate. It has no paid-conversion or trial-ending contract.
- “New profiles” counts `enrichedProfiles.created_at`. A profile/customer row is not automatically an account registration.
- Revenue sums normalized orders using `paid_at || created_at`, without an authoritative paid-status contract shared across providers.
- Dashboard windows are rolling elapsed 7/30-day periods ending at `Date.now()`, not calendar-day ranges in `America/New_York`.
- Partial spoke failures are collected by `Promise.allSettled`, but several downstream fetchers return empty arrays on failure. The new business contract must carry availability and error metadata so a failure cannot become a false zero.
- PostHog reporting is separate under **Reports → Product Analytics**. Only Rejoice and Rekkrd have active connections. Their aggregate snapshots cover 7/30/90-day windows; Rejoice snapshots begin August 3, 2026 and Rekkrd snapshots begin September 12, 2026. Both were successfully refreshed September 20, 2026.
- PostHog lifecycle stages are independent distinct-ID counts, not a sequenced funnel. For Rejoice, “signup” temporarily combines `user_signed_up` and `Application Installed`, so it is not yet a clean registration count. Rekkrd maps `signup_completed` to signup.
- Rejoice purchase-start and plan-selection events are paywall interactions. The runbook identifies RevenueCat as revenue truth. The configured spoke reader exposes `revenue_events`, but the event types, idempotency, refund handling, and first-payment semantics still need reconciliation before it can supply “new paying customers.”
- A configured subscription reader exists for LaneWise, Rekkrd, and Sproutify Farm. Only Rekkrd and Sproutify Farm map a period end. None of the current normalized subscription contracts explicitly represents trial status, scheduled cancellation, grace period, extension, first confirmed payment, or authoritative provider timestamps.
- The Hub `marketing_task_queue` is an execution queue (`task_type`, payload, priority, status, attempts), not a user-facing weekly action workflow. It currently has no rows. Existing dashboard snoozes and inline outcomes are useful UI patterns but do not constitute persisted approve/edit/skip/defer state.

No customer/profile records and no fresh business counts were queried during this audit. Connection status and configured table mappings prove reachability/configuration, not metric correctness or data freshness.

## Source matrix

Availability terms:

- **Available**: a definition can be supported now by an authoritative source and required fields.
- **Partial**: a candidate source exists, but semantics, exclusions, timestamps, or deduplication are incomplete.
- **Unconnected**: no configured reader/provider supplies the metric.
- **Not applicable**: the branch's confirmed business model does not use that metric.

| Branch | Registrations | Paid conversion / purchase | Trial metrics | Current source coverage and gaps |
| --- | --- | --- | --- | --- |
| ATL Urban Farms | **Partial** — `customers_tagged.created_at`; identity is customer id/email | **Partial** — `orders` and `legacy_orders`; candidate first-time buyer requires dedupe across tables by order id plus normalized email/customer id, paid-status rules, test exclusions, refunds, and reliable `paid_at` fallback | **Not applicable, pending owner confirmation** | Active spoke; last connection test Aug 8. Orders have useful payment/amount fields, but legacy overlap and first-buyer semantics must be reconciled. Use the label **First-time buyers**, not subscriptions. |
| LaneWise | **Partial** — `profiles.created_at`; identity is profile id/email | **Partial** — `subscriptions.created_at/status`; no payment evidence or reliable customer join in the mapping | **Unconnected** — no expiry/trial-state mapping | Active spoke; last test Aug 19. Subscription mapping uses the subscription row id as `customer_id`; confirm provider and join semantics in the owning repository. |
| Once Upon A Drawing | **Partial** — `profiles.created_at`; identity is profile id/email | **Partial** — `book_orders` and `orders`; candidate first-time buyer by `user_id`, but payment status, amount, duplicate/order lifecycle, and test rules are incomplete | **Not applicable, pending owner confirmation** | Active spoke; last test Aug 19. Use **First-time buyers** if verified. Do not claim revenue from the current mapping because totals are not mapped. |
| Rejoice | **Partial** — `user_profiles.created_at` is an account candidate; PostHog combines signup and install signals | **Partial** — RevenueCat-backed `revenue_events` is the stated truth, but event taxonomy, first-payment evidence, transaction dedupe, refunds, renewals, and effective timestamp need verification | **Unconnected** — no authoritative trial status/end reader is established | Active spoke; last test Aug 8. Active PostHog connection refreshed Sep 20; snapshots from Aug 3. Keep PostHog for product behavior, not revenue truth. |
| Rekkrd | **Available candidate** — PostHog `signup_completed`, distinct product ID, with snapshots from Sep 12; reconcile against auth/profile creation and exclude internal/test IDs before promotion | **Partial** — `subscriptions` provides status and period dates but not confirmed first-payment evidence | **Partial** — period end exists, but trial/grace/cancel/extension states are not represented in the normalized contract | Active spoke; last test Jul 3. Active PostHog connection refreshed Sep 20. PostHog IDs are Supabase UUIDs and are intentionally not email-matched in Trellis. |
| SpectIQ | **Unconnected** | **Unconnected** | **Not applicable unless a subscription product is confirmed** | Active Hub branch with no spoke connection. Hub prospecting records are sales workflow data, not customer registrations. |
| Sproutify Farm | **Partial** — `profiles.created_at`; identity is profile id/email | **Partial** — `seed_orders` lacks mapped payment state/amount; `subscriptions` lacks payment evidence | **Partial** — subscription period end/status exist, but trial/grace/cancel/extension semantics do not | Active spoke; last test Aug 8. Product/order mappings are insufficient for a trustworthy first purchase today. |
| Sproutify Home | **Partial** — `trellis_home_customers.created_at`; identity is customer id/email | **Unconnected** | **Unconnected / possibly not applicable** | Active spoke; last test Sep 12. Only a customer table is configured. |
| Still Jane's Daughter | **Unconnected** | **Unconnected** | **Not applicable, pending owner confirmation** | Active branch with no spoke connection. |
| Sweetwater Urban Farms | **Unconnected** | **Unconnected** | **Not applicable, pending owner confirmation** | Active branch with no spoke connection. |

For every promoted source, the implementation contract must also record:

- authoritative provider/table/API and owning repository;
- stable deduplication key and cross-table collision policy;
- event/effective timestamp and New York reporting boundary;
- earliest trustworthy coverage date and refresh timestamp;
- internal/test/import exclusions;
- branch-scoped authorization and aggregate/detail permissions;
- `available`, `partial`, `unconnected`, `not_applicable`, `stale`, or `error` independently for each metric.

## Supported first increment

Do not launch four misleading cross-brand totals. Build the UI and typed availability contract, then promote metrics branch by branch only after reconciliation.

The safest first reporting increment is:

1. **Registrations:** Rekkrd after reconciling `signup_completed` to the auth/profile source and defining test-user exclusions. Add other branches when their profile row is proven to mean account creation rather than import/customer/contact creation.
2. **First-time buyers:** ATL after reconciling current and legacy order tables and establishing paid/refund/test rules. Once Upon A Drawing can follow if order state is authoritative.
3. **New paying customers:** Rejoice only after RevenueCat event semantics and first-payment/refund/idempotency rules are verified; subscription-table rows alone are insufficient.
4. **Trials expired / ending soon:** show **Not connected** or **Not applicable** until an authoritative billing reader exposes trial lifecycle state. Do not infer expiry merely from `current_period_end`.

This means the first visual increment may contain real values for only the verified branch/metric pairs and explicit coverage states everywhere else. That is preferable to a polished false total.

## Metric contracts

| Metric | Display contract |
| --- | --- |
| New registrations | Unique real accounts created in `[start, end)` according to the product's authoritative auth/account source. Exclude test/internal users, imports, anonymous installs, page visits, event registrations, and duplicate deliveries. |
| New paying customers | Unique customers whose first confirmed paid entitlement began in `[start, end)`, backed by billing/payment evidence. Exclude trial starts, checkout/paywall activity, renewals, repeated webhooks, failed payments, and refunded/voided transactions according to the documented cutoff policy. |
| First-time buyers | E-commerce alternative: unique customers whose first successfully paid, non-voided order occurred in `[start, end)`. State whether guest and account orders are unified by normalized email and how legacy orders are deduplicated. |
| Trials expired | Trials whose authoritative state confirms an actual non-converted end in `[start, end)` as of the displayed cutoff. Scheduled cancellation, grace period, extension, late conversion, and billing lag remain distinct. |
| Trials ending soon | Currently eligible active trials with authoritative scheduled end in the next seven calendar days, refreshed before any follow-up. Exclude paid, extended, ended, suppressed, or otherwise ineligible accounts. |

Define reactivation, refund, correction, and late-arriving-event behavior per provider before coding. Store/report effective time separately from observed/ingested time. Jev may later rank actions; it must never manufacture counts or redefine provider truth.

### Date and comparison rules

- Default: **Last 7 days**; options: **Today** and **Last 30 days**.
- All labels and boundaries use `America/New_York` calendar dates.
- Closed historical days use `[local midnight start, local midnight after end)` converted to UTC. DST days may be 23 or 25 elapsed hours.
- “Today” is local midnight through the displayed as-of time. Its previous-period comparison is yesterday from local midnight through the same local clock time, capped safely around DST transitions.
- “Last 7 days” means today plus the six preceding local calendar days through the as-of time; “Last 30 days” is analogous. The prior comparison uses the immediately preceding equal number of local calendar dates and the same partial-day cutoff.
- “Trials ending soon” always carries its own forward-looking label, such as `Sep 20–Sep 26`, and is not mixed into the historical date selector.
- A cross-branch total is displayed only with its coverage, for example `3 of 10 branches`. A successfully observed empty result is `0`; missing, stale, failed, partial, and not applicable remain distinct.
- Do not deduplicate people across brands or claim an ecosystem-wide unique-person count until a lawful identity-resolution contract exists for these sources.

## Proposed first screen

```text
Overview

Your business                         [All branches ▾] [Last 7 days ▾]
Sep 14–Sep 20, 2026 ET                Updated 9:05 AM · 2/10 fully covered

┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ New registrations│ New paying /     │ Trials expired   │ Trials ending    │
│ 12               │ first-time buyers│ —                │ —                │
│ +3 vs prior      │ 4  · +1          │ Not connected    │ Next 7 days      │
│ 1/10 covered     │ 1/10 covered     │ 0/10 covered     │ 0/10 covered     │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

What needs your attention                         2h weekly budget
1. [20m · Sheree] Review eligible trial follow-ups       [Review] [Defer]
2. [35m · Clint] Verify ATL first-buyer decline evidence [Open]   [Skip]
3. [45m · Sheree] Approve prepared conversion response  [Edit]   [Approve]

[Existing Control Room content continues below]
```

The numbers above are layout examples, not observed business counts.

### Interaction and states

- Reuse the global branch picker, but place a clearly visible scoped control beside the local date selector in the business-summary header.
- On mobile, use a two-column metric grid and full-width action rows; preserve keyboard focus, text labels, and 44px minimum controls.
- A metric card opens an in-page drawer containing definition, exact boundaries, per-branch value/status, source, coverage start, refreshed/as-of time, and only the supporting detail the current user is authorized to see.
- Aggregate-only sources remain aggregate-only. Never create person-level records or links from PostHog snapshots.
- Cards render loading, true zero, partial coverage, stale, disconnected, not applicable, and provider error independently. Successful branches survive another branch's failure.

## Implementation stages

### Stage 1 — Confirm source contracts outside the UI

For each proposed first-increment branch, document the authoritative source with its owner and reconcile sample periods against provider/source reports using identical boundaries. Confirm test-user rules, identity/dedupe, event states, payment/refund semantics, freshness, and earliest trustworthy date. Source-system changes belong in the owning repositories; Trellis spokes remain read-only.

Deliverable: signed-off provider contracts for at least one registration metric and one purchase/payment metric, plus explicit trial gaps.

### Stage 2 — Add a typed aggregate reader

Add one branch-scoped, protected business-metrics contract rather than extending the profile payload or copying source rows into the Hub. Prefer server-side aggregate reads through existing protected connection infrastructure. Return:

- metric key, branch id/slug, value or null;
- availability state and reason;
- effective `[start, end)` and timezone;
- prior-period value when comparable;
- source label, coverage start, refreshed/as-of time, stale threshold;
- aggregate/detail capability and error metadata.

Use settled per-branch reads. Authorize branch scope server-side. Log only sanitized diagnostics. Add schema/cache only if measured latency or provider limits require it; if added, store aggregates and provenance, never profiles.

### Stage 3 — Put the summary on Overview

Add the `Your business` section above current Control Room content. Extend dashboard types rather than overloading `WindowTotals`. Keep existing operational cards and tabs intact. Add the detail drawer, exact range labels, coverage badges, and all independent states. Avoid broad visual refactors.

### Stage 4 — Add the weekly action workflow

Start with deterministic rules over verified metrics and existing operational evidence. Produce at most three actions that fit the configured combined budget and one primary business objective. Each action needs evidence, owner, effort, prepared artifact/checklist, approval boundary, measurement window, expiry, and durable outcome.

Do not reuse `marketing_task_queue` as the user-facing store without extending its contract: it lacks owner, effort, evidence, approval state, deferral/expiry, dedupe key, and result review. Prefer a small Hub-owned workflow only after checking whether the existing `MarketingTask`/Tasks page can be made durable without creating a second job system. Reuse existing dashboard snooze/outcome interaction patterns.

No recommendation may automatically send outreach, publish, deploy, change an account, or bypass consent/suppression. Where person-level authorization or consent is missing, create a source-system review task rather than an outreach list.

### Stage 5 — Optional Jev prioritization

Only after deterministic counts and durable action outcomes work, evaluate Jev for ranking or quality review. Keep explicit rules, effort limits, consent, and execution in code. Preserve probabilities and expose uncertainty to policy. Jev never supplies or repairs business counts.

## Verification gates

- Reconcile every promoted metric against its authoritative provider over the exact same New York boundaries.
- Test duplicate events/orders, imports and test users, renewals versus first payment, refund/void, reactivation, trial extension, scheduled cancellation, grace, actual expiry, late conversion, and late-arriving corrections where relevant.
- Test spring/fall DST, partial today, empty periods, insufficient history, stale snapshots, provider failure, partial coverage, not applicable, empty branch selection, and aggregate-only authorization.
- Verify Overview remains the default and the summary is visible without scrolling on representative desktop and mobile viewports.
- Verify drawer scope/range matches the card and never exposes unauthorized person-level data.
- Add focused unit/contract tests for date boundaries, provider adapters, availability aggregation, and coverage labels. Run `npm run test:posthog` when PostHog contracts are touched, `npm run test:sage` when shared reporting is touched, `npx tsc --noEmit`, and `npm run build`.
- For Stage 4, test stable dedupe, unfinished-item reuse, expiry, defer/skip/approve/edit persistence, owner assignment, total effort cap, consent/suppression, and result-review timing.

## Open product decisions versus source blockers

### Decisions Clint and Sheree can make without more source access

- Whether the weekly two-hour budget is combined or per person (this plan assumes combined).
- Which single business objective should win when several brands need work.
- Whether e-commerce cards should replace “New paying customers” with “First-time buyers” dynamically or show a separate labeled card in single-branch scope.
- Which owners and action categories are allowed in the initial weekly queue.

### Source blockers that must not be answered by assumption

- Authoritative registration source and internal/test exclusion for each branch.
- RevenueCat event taxonomy and first-payment/refund/trial semantics for Rejoice.
- Billing provider and payment evidence for LaneWise, Rekkrd, and Sproutify Farm.
- Trial-state, scheduled-end, grace, cancellation, and extension fields for every subscription product.
- Paid-order and legacy-deduplication rules for ATL and Once Upon A Drawing.
- Whether trial metrics are truly not applicable for the commerce/content-only branches.

## Acceptance boundary

The first implementation increment is complete only when at least the agreed supported branch/metric pairs reconcile to their authoritative sources, explicit unavailable coverage is visible for all other active branches, drawer details explain scope and provenance accurately, and relevant tests/builds pass. A mocked four-card layout is not complete business reporting.


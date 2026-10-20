# Home analytics release — 2026-10-20

Frontend and analytics functions deployed. Automatic TikTok publishing remains off.

## Measurement contract

Home PostHog project 614240 uses spaced milestone names. Trellis maps those names, confirmed server signup events and verified payment receipts. Neither identify/login nor mutable subscription flags proves signup or payment. Source ledger and outbox live in Home, not the Hub; the authoritative source release guide is sproutify_home_admin/docs/HOME_CONVERSION_TRACKING.md.

Signup coverage begins with accounts created since 2026-10-20T13:41:25.782758Z. Paid coverage additionally requires payment_tracking_ready in the latest source heartbeat. Counts stay unavailable while billing prerequisites are incomplete. Source freshness expires after 24 hours, with an hourly report cache. First-payment queries group across all exported history before filtering the report window, excluding renewals. Gross paid acquisitions are not net revenue or refund-adjusted subscribers.

## Production verification

- Trellis release 614e11c deployed successfully; live build-info matched. Home's three prerequisite migrations and Stripe/analytics functions deployed.
- Home event/property allowlists updated only for connection bd478460-238f-4f98-b98e-18cf1e4e0f93. Rejoice/Rekkrd configuration was preserved.
- Live worker returned 401 without authentication and 200 sent:0 with its dedicated credential. PostHog source heartbeat was observed by the live report. No synthetic signup/payment was created.
- Live Home report read the corrected milestones: 2 onboarded and 2 tower users in the checked 30-day window. Counts can change.
- Paid reporting stays unavailable pending RevenueCat server key/deployment and Stripe invoice.payment_succeeded delivery verification. The existing RevenueCat handler remains live.
- n8n Home: Verified Analytics Sync, xGExdfXvObRjPtLAnFUDz, has a 15-minute schedule imported but remains inactive. The operator deferred dedicated credential entry. Finish that step, test, and publish only this analytics workflow.
- TikTok publisher remains unpublished. Existing TikTok metrics/token-refresh workflows are unchanged.
- Home dependency audit CI reported vulnerabilities; deployment and billing regression checks passed separately. Do not describe overall CI as clean.

## Limits and recovery

Traffic changes near a TikTok post are correlation, not proof of attribution. The TikTok profile currently has no clickable Website field. Existing customers require verified historical receipt backfill before first-payment reporting can include them.

To pause exports, deactivate only the new analytics workflow. Restore saved webhook/function bundles if needed; retain additive tables and collected receipts. No destructive rollback is required. Automatic publishing remains disabled throughout.
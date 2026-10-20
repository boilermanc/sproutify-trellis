# Home analytics reconciliation — 2026-10-20

Prepared locally; not deployed. Automatic TikTok publishing remains off.

## Evidence and correction

Home PostHog project 614240 uses spaced milestones (`onboarding completed`, `tower added`, etc.). Home identifies users but previously emitted neither confirmed signup nor verified payment events. Neither `$identify` nor mutable subscription/trial flags establishes a new account or first payment.

Trellis now maps the actual Home milestones and uses a separate paid metric. It hides signup/payment counts until a successful Home export marker exists within 24 hours. Old snapshots without coverage metadata are rejected. Independent activity counts are not displayed as ordered conversion rates. New/returning totals remain unavailable while signup coverage does not span the whole selected report window.

## Source implementation

The user approved including Home's pending billing upgrade. Source changes are in `sproutify_home_admin`. Its authoritative release guide is `docs/HOME_CONVERSION_TRACKING.md`; it specifies the three migration prerequisites, handler/worker deployments, secure configuration, schedule and recovery.

Confirmed accounts and positive production payment receipts use a durable outbox with stable event UUIDs. Raw receipts remain in Home. The export contains account UUID, event, original timestamp, and fixed categorical metadata only. No names, emails, amounts, or raw billing payloads enter Trellis.

Trellis queries the first payment across all exported history before filtering to the report window. This excludes renewals from first conversions and handles late receipts. The metric covers accounts created after tracking starts. Existing customers need verified historical receipts before they can be included. It reports gross first paid acquisitions, not net revenue or refund-adjusted active subscribers. The source heartbeat and payment events do not inflate active-user or retention counts.

## Release and validation

Deployment, production migrations, secure worker configuration and scheduling remain pending explicit release approval. Commit/push has not been performed. Update only Home's connection allowlists using `getPosthogBranchDefaults`; defaults alone do not rewrite saved connections. Preserve Rejoice/Rekkrd.

Local validation: Home backend tests, actual migration execution with PGlite, Trellis contract/Sage tests, TypeScript and synthetic browser report. The browser fixture uses no live service calls and its counts are not real. Live provider flow, source freshness and production report reconciliation must be verified after release. No fake production signup/payment events were sent.

TikTok attribution still needs acquisition evidence. A rise in visits or conversions near a post is correlation, not proof of attribution; the TikTok profile currently has no clickable Website field.

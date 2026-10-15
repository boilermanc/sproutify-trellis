# Sweetwater Leads

Open **Audience → Sweetwater Leads**, or https://trellis.sproutify.app/?view=sweetwater-leads. Active Trellis owners and administrators can review contacts, source pages, context, transcripts, consent, alert attempts, notes, and follow-up status. Test inquiries are hidden by default. Notes and statuses use optimistic concurrency; unsaved changes prompt before leaving.

## Live capture and alerts

- `sweetwater-inquiry` accepts AI-help, app-idea, greenhouse-interest, and card-chat captures. An acknowledgement is returned after the database save.
- The original website contact URL, `4a7ce38b-f497-424f-9936-f636f5b68514`, now saves the original form body into the same inbox. Full messages are retained in the conversation; the alert summary is limited to 1,000 characters. Identical submissions within a UTC day share a content-derived retry ID. The database compares the full payload before acknowledging a reused ID.
- Card chat saves on `lead_captured`, rather than on every subsequent chat message. It preserves source, segment/interest, submitted conversation, and explicit consent, using the browser session UUID for retry safety.
- **Sweetwater Lead Email Alerts** checks every minute. It sends branded HTML plus plain text to **clint@sweetwater.technology**, from **Sweetwater Tech <notifications@sproutify.app>**, using the existing native Resend API credential. Sweetwater's domain is not currently a verified Resend sender.
- One inquiry is claimed per run. Claims have a two-minute lease; failed sends retry after five minutes, up to eight attempts within 23 hours. Resend idempotency keys prevent duplicate sends. The inbox says provider acceptance; delivery is separately verified in Resend.
- Phone-only inquiries have no fabricated email or profile. Existing customer names, phone numbers, and global marketing preferences are preserved. No marketing is triggered by this inbox.

## Workflow references and recovery

- Capture: `P6f-omooyw0uhshOMBp2Q`
- Email alerts: `rPHbi13hY557tAqgb-NsF`
- Original contact replacement: `tXl1IzKp4g5Kzp1aLbVps`
- Existing card chat: `e4a9IZIaUHZ5zpePesfET`
- Original contact notifier `brCYIpq416HUu7Lk` is preserved but unpublished. It sent blank details because it read root fields instead of the webhook body. To roll back the endpoint, unpublish the replacement first and republish the original; doing so restores that known limitation.

Credential-free deployment snapshots are in `n8n-blueprints/sweetwater-*`. On import, explicitly select **Sproutify Trellis** on every database node and **Resend account** on the sending node. n8n may choose an unrelated default credential despite a matching credential name in an import. Never publish before checking these selections. Do not use the generic `Resend ATL Batch Send` header credential for these alerts: it produced `ERR_INVALID_HTTP_TOKEN` during validation.

## Historical audit — October 15, 2026

The existing general CRM contained 28 leads: 21 contacted (17 tower-farm-form, four Agrotonomy), six lost tower-farm-form leads, and one manual lead still new/open. These remain in the general Leads page.

No pre-existing Sweetwater inquiries were found in the Sweetwater category, marketing event history/archive, or failed-import queue. Both original contact and card-chat workflows had no retained executions. This is **not proof that no leads were missed**.

A connected-mailbox search found a September 23, 2026 **New Sweetwater Tech Support Request:** message sent to `team@sproutify.app`, unread and in Trash. Its sender name, email, subject, and message fields were blank; it contained no recoverable visitor details. It may have been a real submission or a test. The original contact workflow now banks submitted fields before acknowledging success, and sends alerts to Clint's requested address.

The old `upsert_profile` function also contains an incompatible array operation for JSONB branches. Card-chat captures now bypass it through the validated inquiry endpoint. Other callers of that shared legacy function were not changed.

## Verification

TypeScript and production build passed. GitHub Actions deployed the inbox successfully. Live tests covered all three new inquiry types, original contact form, and card capture; duplicate retries retain one row per request. Database integration assertions cover identity preservation, phone-only capture, access restrictions, and notification retries and run inside a rollback transaction. The authenticated live inbox was checked for loading, test filtering, detail display, and persisted notes/status. Branded email input escaping and the desktop preview were checked; delivery is checked in Resend separately from API acceptance.

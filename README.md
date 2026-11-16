<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1xhH6r_RnjW_UmSuqCUI_OQtrJoJ2XUGC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure the public Supabase connection in `.env.local`. Store AI keys only on the backend; see **Server-side AI** below.
3. Run the app:
   `npm run dev`

## Server-side AI

Gemini, OpenAI and Anthropic text requests (including Sage, social copy, brand
analysis and studio planning) use the authenticated `ai-generate` Edge Function.
The function checks a valid session and active `trellis_users` membership before
using the fixed Trellis organization's keys. Browser requests contain prompts and
generation options only; provider errors and keys are never returned.

`tenant-secrets` returns an empty string or `__configured_server_side__` in the
three legacy AI key fields. This is a status marker used by existing availability
checks, not a usable credential. Active members receive only AI status and the
active provider; owners/admins retain access to the other integration settings.
AI replacement keys can be entered by an admin in Settings → Secrets. A blank
field or unchanged marker preserves the saved key; saving does not reveal it.
Newly typed keys are cleared from the form after a successful save. Removing a
key requires a separate backend administrative operation; blanking the form does
not revoke it. Other integration credentials are outside this migration's scope.

Server environment variables `GEMINI_API_KEY`, `OPENAI_API_KEY`, and
`ANTHROPIC_API_KEY` take precedence over the corresponding `tenant_secrets`
columns. A key in local `.env.local` does **not** configure the hosted function.
If an environment key is set, rotate it there rather than entering a replacement
in Settings. Never copy keys into chat, tracked files, frontend code or `VITE_*`.

Model selection is controlled on the server via `GEMINI_TEXT_MODEL`,
`OPENAI_TEXT_MODEL`, and `ANTHROPIC_TEXT_MODEL`. Defaults are
`gemini-3.5-flash-lite`, `gpt-4o-mini`, and `claude-haiku-4-5`. Legacy studio model
hints do not override server selection. Structured JSON and the brand analysis
Google Search fallback are preserved; arbitrary tools, file URLs and HTTP options
are not forwarded. Provider access and billing must be checked during rollout.

Release preparation: verify Switchboard selects Trellis hub
`horvjqqifgrzxesuxtfm`; obtain deployment approval before remote changes. In a
coordinated maintenance window, deploy `ai-generate` and the updated
`tenant-secrets` with gateway JWT verification enabled, then release the matching
frontend build. Old frontend builds cannot use the redacted keys. Use the
Switchboard wrapper for all Supabase CLI operations. No schema migration is
required: the hub already has RLS enabled on `tenant_secrets` with no `anon` or
`authenticated` grants (verified 2026-11-06).

After deployment, configure the keys securely, test one request per provider,
verify an unauthenticated request is rejected, and inspect the settings response
and browser network traffic for absence of provider credentials. Rotate any keys
previously delivered to browsers through the old settings response. If rollout
fails, keep AI temporarily unavailable and repair the backend; do not restore the
old endpoint that returned plaintext keys.

Local checks (no live provider calls):

```sh
node --test tests/ai-backend.test.mjs tests/card-direction-copy.test.mjs tests/creative-studio-ideas.test.mjs
npx tsc --noEmit
deno check supabase/functions/ai-generate/index.ts supabase/functions/tenant-secrets/index.ts
npm run build
```

With Vite on port 3015 and Playwright available, run
`node tests/ai-settings-browser.mjs` and `node tests/social-idea-chat-browser.mjs`.
Set `STUDIO_TEST_URL` to the exact preview origin and `PLAYWRIGHT_MODULE` if
Playwright is installed outside this project. These fixtures intercept external
requests and cover key status, save failure/retry, cleared replacement keys,
chat/brief handoff, brand isolation and mobile layout.

## Content intelligence workflow

### Card Studio groups and suggested briefs

Use **Done with this group** to close the working gallery into a summary. Resume
keeps the same cards and edits; starting a new group asks before replacing any
unfinished cards. Already scheduled cards stay scheduled. Completion waits until
active rendering, generation, uploads, and approvals finish.

Under **Adjust style and number of concepts**, choose a creative direction before
**Suggest brief**. Named directions supply the subject of the brief; Variety pack
uses only the current brand's directions. Every brand also has a **[Brand] features**
option, grounded in its active Brand DNA mission, site description, and marketing
hooks. Missing details produce an error instead of a fabricated feature brief.
Review saved Brand DNA for accuracy; it is not a live website scan. Rekkrd uses a
small product-site feature list checked on 2026-11-06 in
`services/cardBriefContext.ts`, avoiding its older valuation-only saved positioning.
Feature mode retains the brand's allowed templates rather than forcing a lifestyle photo.

Checks: `node --test tests/card-brief-context.test.mjs tests/card-brief-generator.test.mjs`
and `node tests/card-studio-browser.mjs` with Vite running. Set `STUDIO_TEST_URL`
and `PLAYWRIGHT_MODULE` as in the other browser tests. The browser test intercepts
external requests and checks group completion, draft preservation, mobile layout,
direction-aware prompt payloads, feature mode, and brand isolation without live AI
calls or database writes.

### Shared X tracking

Open **Social Hub → X tracking · @boilermanc** for shared posts, mentions,
daily public metrics, and multiple project tags. This account spans all projects
and is available to owners/admins. See the [shared X tracking guide](docs/SHARED_X_TRACKING.md)
for the migration, OAuth setup, inactive n8n schedule, limits, and local verification.

### Edit existing footage in Clip Studio

Select a branch, open Clip Studio, and choose **Edit a video**. Import a local MP4,
M4V, MOV or WebM (up to 250 MB; the browser must support its codecs). Set a start
and end time, preview that range, optionally add a headline, and choose whether
to keep the original audio. Export MP4, review the resulting video, and download
it plus the separate post caption for manual upload.

This local editor preserves the source framing, limits edits to three minutes,
and exports in real time. Keep its tab visible during export. MP4 encoding must
be supported by the browser; unsupported browsers show an explanation rather
than downloading a mislabeled WebM. The source is unchanged. Files, edits and
exports are session-only and are not saved in the cloud clip library. Leaving
the editor or changing branch clears them. No publishing or scheduling occurs.

Validation: `node --test tests/local-video-edit.test.mjs`, `npx tsc --noEmit`,
and `npm run build`. With Vite running, the isolated editor is available at
`/tests/fixtures/clip-video-editor.html` for real-file import/export checks without
database or AI calls. Test trim boundaries, sound, cancel, unsupported codecs,
invalid ranges, and the exported MP4 itself before release.

### Social Hub idea chat

Select a brand and open Social Hub → Create a post. Use **Suggest what to post next** or message Sage with an idea. Sage uses that brand’s description, tone, keywords, default call to action, and up to 12 recent publishing records from Trellis. Expand **Posts Sage is using** to inspect the context. Native-platform posts not recorded in Trellis and engagement metrics are not included; failed or empty history is explicitly labeled.

Continue the conversation, choose **Prepare a post brief**, edit it, then **Add brief to my notes**. This appends to existing notes; creating drafts and publishing remain separate actions. Chat uses the AI provider configured in Settings. The conversation, unfinished message, editable brief, and notes automatically save per brand in this browser and restore after navigation, brand changes, or refresh. Storage errors are shown beside the affected editor. Saved content is sanitized and remains on this browser/device; clearing browser data removes it. Recent-post context reloads when you return. Leaving during an AI request preserves your unfinished message so you can send it again; a response from the old view is ignored.

To verify locally with Vite running, run `node tests/social-idea-chat-browser.mjs` (Playwright required; optionally set `PLAYWRIGHT_MODULE` and `STUDIO_TEST_URL`). External AI and database requests are intercepted by fixtures.

Start with the plain-language [Content Intelligence operator guide](docs/CONTENT_INTELLIGENCE_GUIDE.md) for what the system does, what each tab means, and the complete day-to-day workflow.

Repository-native schemas, project-partitioned records, task templates, and helper internals live in [`.trellis/README.md`](.trellis/README.md). Every configured branch shares the workflow while keeping topics, posts, performance, and learned strategy separate.

## Proposal quality checks

Consulting CRM contacts and original project-file storage are described in
[Project Room CRM](docs/PROJECT_ROOM_CRM.md), including upload recovery, privacy,
verification, and the migration/release requirements.

Automatic company proposals estimate discovery only, including checking and handing
over the discovery findings. Implementation recommendations remain unpriced until
Clint or Sheree defines bounded scope and selects the implementation review checkbox.
This checkbox requests an estimate; it does not approve or send a customer quote.
Editing scope, assumptions or exclusions resets that choice. Existing saved proposals
are not rewritten automatically.

All new AI estimates require activity-level hours that sum to each task, unique
activity IDs/descriptions, exclusions, and substantive source text. Heading-only
citations, repeated activities and generated contingency fees are rejected before
prices are applied. Risks belong in assumptions for review. These checks verify
structure and arithmetic, not the truth of AI claims or the reasonableness of effort;
paraphrased overlap and misclassified tasks still require human review.

Client research identifies Clint and Sheree as consultants. Customer approval
authority stays unknown until confirmed. The chief of staff performs a separate final review of the completed estimate,
research, questions, roles, scope, semantic overlap, effort rationale and handoff.
Every required check must pass; missing/malformed reviews, uncertainty, or issues
cannot mark the proposal ready. A rejected automatic estimate leaves an unpriced
draft, visible findings and an alert. Raw research remains available for audit.
Automatic review model and usage are retained alongside generation usage; this
adds one AI request. Manual estimates also require a final review before preview.

Verify with `npm run test:project-rooms`, `npx tsc --noEmit`,
`deno check --no-config --node-modules-dir=none supabase/functions/project-rooms/index.ts`,
and `npm run build`. The local `tests/fixtures/project-room.html?scenario=report`
flow uses synthetic responses with no live provider calls. Check discovery default,
implementation review, preview/save, Word export and mobile layout.

Release requires the frontend and `project-rooms` Edge Function together; no schema
migration. Keep the prior deployment available for rollback. Live model verification
and any correction to existing customer drafts are separate release checks; do not
claim fixture tests validate real provider output.

The saved-proposal action **Run chief final review** rechecks existing drafts using
current research and questions. A failed review shows **Needs rework — Chief of staff
found issues**, correction details, and requested input from Clint/Sheree. It keeps
the evaluated priced proposal in `proposal_generation.held_proposal` for recovery,
sets current fee rates to unpriced, and leaves the proposal drafted. A later failed
review of an unpriced draft cannot overwrite that priced snapshot. A passing rerun
clears the note; it never sends a customer proposal. Already sent/won/lost proposals
must be moved back to draft first. Concurrent writes use the existing version check.

## Newsletter reminder safety (prepared 2026-11-15; not deployed)

Read-only Hub investigation supports the November 14 incident report:

- Original campaign: `579edbfb-33eb-439a-bee8-a8be1006137e` (ATL Newsletter 11/12/2026).
- Reminder: `179f87b2-d89e-4dd2-b892-00f8d00fbfa5`; 3,195 selected, 3,184 outbox rows marked sent.
- 1,622 distinct addresses in those sent rows had an original-campaign `opened` event with `occurred_at` before the reminder's creation time.
- Exact equality between the saved original subject and its open-event subjects returns zero events. Removing U+200D from both sides returns 2,226 events as of inspection. The saved subject contains U+200D; those event subjects do not.
- Both original and reminder saved `dispatch.html_template` values contain literal `[DATE]`.
- The original has 3,195 provider-message mappings, all with a terminal delivery outcome recorded at inspection.

These are database-record findings. We did not inspect the exact deployed client bundle, independently confirm every delivered message with the provider, or establish that the stored template exactly reproduces every delivered body. Current checked-out code used subject equality in `fetchNonOpeners`, consistent with the failure. Open events use names such as `opened`, not `email.opened`.

### Request and attribution flow

The campaign row action passes `campaign.id` into `ResendModal`. The client sends only that UUID, its single business slug, the new subject, and (on send) a signed preview token to `newsletter-resend`. It never supplies the audience. The endpoint verifies the caller with Auth; `newsletter_resend_source` requires an active Trellis staff record, original ownership or the existing owner/admin/operator permission, and an exact business match. Ordinary staff can read shared campaigns but cannot resend a colleague's campaign. Authorized marketing operators can handle legacy ownerless originals. Missing, multi-business, mismatched, unsent, or reminder originals are rejected.

The service-only source RPC reads the original's sent outbox recipients, `campaign_sends` provider IDs, and events by campaign ID or exact provider message ID (including early webhook events with a null campaign ID). Ambiguous mappings and conflicting event attribution stop the request. Every original sent message must have a recorded terminal outcome; an empty successful events query is insufficient. Query errors, missing arrays, incomplete coverage and expired event history stop the request. This does not prove that no individual webhook was ever lost; verify webhook health and open tracking before a future send.

The server intersects that audience with the business's authoritative consent source and global/business suppressions: each branch uses the reviewed contract in `supabase/functions/_shared/newsletter-consent.mjs` (listed below). Missing fields or read failures stop the request; no generic subscription fallback is used. Only delivered recipients with current consent remain; known openers, clickers, bounces, complaints, failures and suppressions are excluded. Counts use mutually exclusive first exclusion reasons, in that order. Opens are imperfect signals: no recorded open does not establish that a person did not read an email.

Preview displays the selected campaign, original sent count, exclusions, final count and up to five opaque source-recipient references with addresses hidden. The signed token expires after ten minutes and binds the authenticated staff actor, business, original UUID, subject and the audience/content fingerprint. Editing the subject invalidates it. The endpoint reloads records and consent on send; **any** audience membership/count/exclusion or content change requires a new preview, including changes that leave the final count unchanged.

`enqueue_newsletter_reminder` locks the original, checks its source version, and creates the reminder and outbox in one transaction. A unique index allows one non-opener reminder per original, including historical reminders. Duplicate calls cannot create a second reminder; an uncertain client response must be reconciled in the campaign list. The worker revalidates current consent, event coverage and fingerprint before each reminder delivery. It stops if anything changes. It does not silently broaden or trim the approved audience.

Reminder delivery uses one provider request per recipient with a stable `newsletter-reminder/<campaign UUID>/<recipient UUID>` idempotency key. Attribution is saved before marking the outbox row sent. Uncertain delivery leaves the same pending recipient/key for a reviewed retry; reminders older than 23 hours are blocked because [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Each invocation yields after about 45 seconds or 120 recipients and cron resumes the same outbox. Large reminders will take longer than the old batch path. No live throughput/load test was run.

Supported merge fields (`first_name`, `email`, `unsubscribe_url`, conditional first-name greetings) are rendered and escaped before validation. Subject and HTML are checked at preview and final worker rendering for editorial placeholders such as `[DATE]`, encoded/formatted variants, and unresolved/unsupported merge fields. Unsupported fields block with instructions to correct content. Reminder CC is deliberately cleared to avoid copying a non-audience address on every recipient's reminder.

### Authorization and migration review

Prepared migration: `supabase/migrations/20261115145257_newsletter_resend_safety.sql`, included in the master `SQL_SCHEMA`. It was generated through Switchboard and **has not been applied**. It adds service-only invoker RPCs, reminder guards and a unique index; it introduces no customer-profile storage. Existing outbox/event records remain orchestration data.

Inspection found anonymous ALL access on `campaign_recipients` and unrestricted authenticated email-data read policies. The migration removes anonymous access and authenticated TRUNCATE/REFERENCES/TRIGGER privileges, enables RLS, adds restrictive active-staff boundaries and converts transitive dependent reporting views to security-invoker views. It blocks old clients from inserting/updating reminders or editing/deleting their audience outside the server path. Existing permissive policies cannot override the restrictive boundaries.

**Shared staff reporting preserved:** active internal Trellis staff retain cross-brand campaign and email reporting, including records owned by colleagues, ownerless legacy campaigns and unattributed transactional events. Anonymous users, external authenticated clients without active Trellis membership and inactive staff are denied. Existing owner/marketing-operator campaign write rules remain in place; direct reminder/audience edits remain blocked. The earlier prepared owner-only policy was a regression and has been removed. This follows the existing global internal-staff trust model; a business/client login is not itself Trellis staff authorization. This is not a complete audit of unrelated security-definer reporting RPCs or application features.

### Branch consent coverage

All 11 currently configured active branches now have an explicit contract. Farm and LaneWise use prepared, unapplied source migrations as of 2026-11-16; they remain blocked at runtime until those RPCs exist. The branch list, configured project bindings and native schemas were inspected read-only on 2026-11-15; the relevant settings/consent code was inspected in each source repository. New or unrecognized branches fail closed. There is no field-name inference or fallback from a failed spoke to Hub consent.

| Branch | Authoritative consent rule |
| --- | --- |
| ATL Urban Farms | Native `resolve_newsletter_audience` RPC: active subscribers |
| Rekkrd | `profiles.email_digest_optin === true OR email_updates_optin === true` |
| Rejoice | `user_profiles.marketing_opt_in === true` |
| Once Upon a Drawing | `profiles.subscribed === true` |
| Sproutify Home | Explicit persisted Auth `user_metadata.notification_prefs.marketingEmails === true`, with profile/Auth ID and email matching |
| SpectIQ | Existing Hub profile branch membership and explicit `branch_consent.spectiq` subscription, with no pause/global veto |
| Still Jane's Daughter | Same Hub-native rule for `still-janes-daughter` |
| Sweetwater Technology | Same Hub-native rule for `sweetwater-technology` |
| Sweetwater Urban Farms | Same Hub-native rule for `sweetwater-urban-farms` |
| Sproutify Farm | Prepared service-only `resolve_marketing_audience` over explicit `email_marketing_preferences.opted_in`, current version/timestamp, and an active native profile |
| LaneWise | Prepared service-only `resolve_marketing_audience` over explicit `email_marketing_preferences.opted_in`, current version/timestamp, and an existing native profile |

Farm and LaneWise now have explicit, default-off settings prepared in their owning repositories. Farm includes desktop, mobile web and native Profile controls; LaneWise includes a Profile control. Their migrations (`20261116122458_marketing_email_preference.sql` in Farm and `20261116122459_marketing_email_preference.sql` in LaneWise) create own-user consent storage, authenticated read/save RPCs with an expected-account guard, trusted timestamps/wording version and a service-only audience RPC. There is no backfill. The Trellis adapter requires these exact RPCs and fails closed if either migration is missing or unreadable; it never falls back to account, billing, operational alerts or positive Hub flags. Their source READMEs describe the offline tests and coordinated release prerequisites. Both migrations remain unapplied; no production schema or data changed.

Home's existing Trellis view labels a non-null MailerLite group ID as `newsletter_subscribed`; that does not represent the actual current marketing toggle and is deliberately bypassed here. The Home settings UI displays default-true preferences, but an absent persisted choice is **not** consent in this workflow. Auth metadata is read solely as the user's communication preference, never as staff/tenant authorization. Only original-campaign recipients' Auth records are requested. Banned/deleted Auth users are excluded; unavailable or mismatched Auth records block the request. Home's profile settings implementation was inspected at `sproutify_home_admin/src/pages/consumer/Profile.tsx`; the native preference flags for Rejoice and Once Upon a Drawing were checked against their live schemas and consent migrations. Those migrations retain historical grandfathering policies; this adapter follows the actual current native flag, without introducing a new grandfathering/backfill rule or claiming that every true flag has independently proven consent provenance.

Hub-native targeting requires an active existing profile, exact branch membership, `is_subscribed === true`, `marketing_pause === false`, and an explicit branch entry with `subscribed === true` and `paused === false`. A missing entry cannot inherit the Hub table's default-true subscription. Operator/lead rows without the branch tag are excluded. For every spoke-backed branch, an existing Hub record can veto native consent through global flags, status, or that branch's pause/unsubscribe entry; it cannot grant consent or reverse a native opt-out. Hub lookup errors stop the request rather than bypass these controls. Conflicting duplicate normalized addresses stop the preview.

ATL requires the existing server-only `ATL_SPOKE_SERVICE_KEY`. Other native adapters resolve the existing encrypted spoke credential via `get_spoke_connection_key`, require a server-only service-role/secret key, and validate the configured branch against its exact reviewed project before any consent read. All reads paginate with a completeness guard. The same implementation runs for preview, queue revalidation, and worker dispatch revalidation. Native opt-in and Hub veto changes invalidate the approved audience through its existing fingerprint. No credentials were created or changed; no addresses, Auth metadata, tokens or provider error bodies are logged. No additional profile storage in Trellis, migration application, deployment, live mail or provider throughput test was introduced by this expansion. The earlier reminder migration remains prepared and unapplied.

### Local verification and future-send review

```sh
npm run test:newsletter-resend
npm run test:campaigns
node tests/newsletter-resend-sql.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
deno check supabase/functions/newsletter-resend/index.ts supabase/functions/campaign-sender/index.ts
npm run build
```

The SQL harness uses isolated embedded PostgreSQL, applies the migration twice, and verifies actual grants, shared staff RLS (including the existing aggregate view), external/inactive isolation, atomic rollback, duplicate/repeat prevention and old-client bypass rejection. It also verifies creation of the previously undocumented outbox table when absent. The full master stamp with all unrelated extension/integration dependencies was not executed. Unit/request/adapter/worker tests cover all branch contracts, real-empty versus failed consent reads, Hub global and branch vetoes, Home Auth preferences and identity matching, blocked/unknown branches, consent changes after preview, and Unicode subject mismatch, invalid IDs, zero opens versus missing/error data, consent and suppression changes, same-count audience changes, rendered placeholders, provider failures and accepted-send/attribution-failure retries. Consent pagination requires an exact count, handles server-capped pages, and stops on missing/changing counts or incomplete results (50,000 rows / 200 pages maximum). The worker also verifies queued recipient addresses, personalization, unsubscribe tokens and the unsubscribe template against the approved source. Farm/LaneWise's prepared source RPCs additionally require current explicit consent and matching verified, non-banned, non-deleted Auth identities. All provider requests are mocked.

With Vite on port 3017, set `STUDIO_TEST_URL` to its exact origin and `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs`, then run `node tests/newsletter-resend-browser.mjs`. Desktop/mobile fixture checks intercept every external request. Screenshots: `tests/fixtures/newsletter-resend-1280.png` and `tests/fixtures/newsletter-resend-390.png`. The browser checks preview/send gating and errors, payloads, responsive width and browser exceptions; they do not contact the production endpoint.

Run `npx tsc --noEmit` for the frontend TypeScript check. The Vite build and both Edge Function checks are separate checks.

Before any future release/send:

1. Review the migration's access changes and historical duplicate/ownerless records in a non-production copy. Validate shared campaign/report views with two distinct active staff accounts and external/inactive accounts. Check other exposed reporting RPCs separately before treating the entire application as tenant-isolated.
2. Review and replace `[DATE]` in approved content. Do not retry the November 14 reminder: a reminder already exists for that original, and the unique guard intentionally blocks another.
3. Verify the selected branch’s consent contract and configured connection, pre-existing server credentials, scheduler authorization, provider open tracking and webhook health without sending mail. Confirm event retention covers the selected original.
4. Obtain separate authorization for a coordinated migration, endpoint, worker and frontend release. Pause the scheduler during a future authorized rollout and inventory pending legacy reminders first; the new worker rejects them. For recovery, keep scheduling paused and retain the restrictive guards; repair forward rather than restoring the subject-matching sender.
5. After an approved release, as the original owner or an authorized marketing operator, review a fresh server preview and final rendered subject/body. A changed audience requires another preview. Once a reminder was queued, do not delete/recreate it to bypass duplicate protection. Any stopped or uncertain send needs operator reconciliation before retry; no automatic replacement reminder is created.

No live mail was sent, scheduled or triggered during implementation. No production data, schema, deployment or credentials were changed, and nothing was pushed.

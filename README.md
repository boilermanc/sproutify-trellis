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

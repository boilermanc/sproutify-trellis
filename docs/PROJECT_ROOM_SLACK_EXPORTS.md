# Project room notifications and research downloads

## Slack

The `project-room-slack` service bridge and PR2 n8n blueprint check for proposal
changes and thread replies every five minutes. A daily summary is queued once
per Eastern calendar day at or after 5 AM. Existing proposals are baselined
without mass notifications. Manual workflow execution creates a daily-deduplicated
test notification for the configured test room.

Proposal notifications and the morning summary go to `chief-channel`. Clint and
Sheree can reply to a proposal notification thread to save a note in that exact
room. Replies do not approve pricing, replace proposals, or start research.
Replies to the daily summary are not assigned to a room. Meetings and calendar
data are not connected; summaries use saved room data only.

Only active company rooms shared with both configured operators are eligible.
Channel membership must match the configured people and approved bots. Notes
are deduplicated by Slack message timestamp; bot messages and edits are ignored.
Busy rooms are retried. Service tables and RPCs are restricted to service role.

Live workflows:
- Main: `b31M9e3LhObf_6Uo7NF91`
- Error handler: `qGfWOu2f3TBfg-vqL7y38`

Technical failures stay in `sweetwater_tech`, using the existing room alert route
and PR3 error workflow. Importing n8n JSON does not reliably restore workflow
settings: explicitly select PR3 as PR2's error workflow and disable execution
data retention in both workflows. Bind existing credentials through n8n; never
put credential values in the blueprint.

An unconfirmed send is held rather than resent automatically. Check the target
Slack channel and reconcile `project_room_slack_messages.delivery_ts` before
retrying a held message. Pausing the n8n workflow or disabling the channel config
stops the integration without deleting notes or proposals.

## Research downloads

Research and Files offer Word (.docx), PDF (.pdf), and Markdown (.md); Word is the
default. These export the full research record through the existing authorized
room export action. The separate assessment Word download remains available.
Files are rendered in the browser; no document-conversion service receives room
content. The PDF renderer and fonts load only when needed.

Run `npm run test:project-rooms`, `npx tsc --noEmit`, and `npm run build`.
`node scripts/verify-research-downloads.mjs` creates synthetic Word/PDF artifacts
under `output/research-downloads` for layout inspection. The browser fixture is
`tests/fixtures/project-room.html?scenario=report`; check both format downloads,
loading/error states, and the responsive selector before frontend release.

Live Slack verification on November 9, 2026 confirmed proposal and digest
delivery, a Clint reply saved once to the StyleBAR comparison room, and a
technical test in sweetwater_tech. Transactional SQL tests cover both operators,
duplicate prevention, revoked access, and unchanged proposals. Sheree has not
yet performed a live reply test herself.

## Production reconciliation — November 10, 2026

The deployed `project-room-slack` version 4 entrypoint and Slack helper match
the checked-in sources. Both published n8n workflows have matching node
parameters, credential references, and connections. Export-only node IDs,
positions, and inactive parameter placeholders are not behavioral differences.
Blueprints intentionally import inactive; do not activate a duplicate alongside
the existing published workflow. Regenerate them with
`node scripts/build-project-room-slack-workflow.mjs`.

The blueprint settings now reflect production rather than an unapplied custom
timezone/240-second workflow timeout. The bridge computes the morning boundary
in America/New_York explicitly; the five-minute cron is timezone-independent.
Individual HTTP nodes retain their 15/30-second request timeouts. PR3 execution
history retention was corrected live to save neither successful, failed, nor
manual execution data, matching PR2. Credential references are identifiers,
not secrets. Do not export credential values into Git.

Verified a new proposal test notification, a reply from Clint saved exactly once
to the mapped StyleBAR comparison room, and a technical test in sweetwater_tech.
The transactional SQL regression passed for both Clint and Sheree, including
duplicate prevention, busy-room retries, revoked membership and unchanged
proposals; all its temporary writes rolled back. A real Sheree-authored reply
remains a separate end-to-end acceptance check; the test thread invites her to
reply. Do not impersonate her or describe the database test as a Slack login test.

Release scope is source reconciliation, not a new backend migration. The schema
and function are already live. Preserve existing channel configuration and
message receipts; do not replay migration seed/config data or replace proposals.
The migration filename uses the applied production version `20261109170937`;
its SQL was compared with the recorded migration and matches. The earlier local
`20261109170903` filename was reconciled before commit to avoid a false pending migration.
If behavior needs to be stopped, pause PR2 or disable the channel configuration;
retain receipts and notes to prevent duplicate delivery on recovery.

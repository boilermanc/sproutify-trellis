# Shared prospects increment â€” release preparation

Implemented and verified on November 7, 2026. Production shared-prospect migration applied as `20261107222523`; `project-rooms` backend version 9 deployed. Frontend publication is pending the separately required commit approval.
The release checkout is `.project-room-release`. Original implementation work remains in `.project-room-observability`; unrelated edits in the main working folder are preserved.
The source baseline is `fdb4eb6334684cd91ff024a32a79aa47405252c0`.

Final packaging also found concurrent AEO changes in `project-room.mjs`, `project-rooms/index.ts`, and a new `project-room-aeo.mjs`. These were left intact. The release patch excludes those additions; the original working files retain them. Review merge conflicts when integrating this patch with that work. They are not claimed as part of this increment.

## Behavior

- Saving a company briefing atomically creates a prospect or links an explicitly selected accessible prospect. Similar names are never automatically merged.
- Existing client rooms receive their own prospect and their creator becomes owner. An owner can add an active teammate; shared members can work in the same room. Access is enforced in the server and database.
- Companies can be marked as customers, archived, restored, and assigned follow-up dates and notes. Archiving preserves history and does not cancel a running research job.
- Saved manual meeting notes remain readable and searchable, with source dates and attribution, and appear in the full room export.
- Sage finds saved evidence in accessible client rooms. This increment uses keyword search with source excerpts, not conversational or semantic question answering. Searches cover at most 50 recent rooms and 20 excerpts; the UI discloses limits.
- Existing Word downloads and partial recorded-token estimates are preserved. Full time tracking and financial ledgers remain outside this increment.

## Daily delivery

`n8n-blueprints/PR1-daily-client-brief.json` is an inactive workflow for 5 AM America/New_York delivery to `#chief-channel` (`C0C0UUF8P2T`). Generate it with `node scripts/build-project-room-digest.mjs`; the embedded formatter comes from the tested shared module.

Select a dedicated HTTP Header Auth credential (`x-project-room-key`) and the saved Slack OAuth connection in n8n. Configure the server bridge hash, actor, explicit room allowlist, and recipient list as documented in `PROJECT_ROOM_MEETINGS_BRIEFS.md`. No credentials are in this patch. The bridge reads only approved rooms currently shared with every configured recipient. Newly created rooms require adding to the report scope.

The workflow confirms Slack's `ok`, destination channel, and message timestamp before recording delivery. Successful scheduled runs save a date guard; manual runs and overlapping executions are not covered by that guard. Automatic retries are off. If delivery times out, inspect Slack before replaying to avoid duplicates. Select an n8n error workflow before activation. Execution payload saving is disabled to avoid storing client notes in workflow histories.

ChatGPT Meetings is disconnected at the user's request. Calendar matching and automatic overnight meeting preparation are not activated. A tested preparation formatter exists for explicitly mapped meetings; it must not guess which company owns an event. The current daily digest explicitly reports these missing connections.

## Validation

- `npm run test:project-rooms`: search, notes, bridge access, reporting, workflow delivery checks, existing intake/research tests.
- `node tests/project-room-shared-sql.mjs`: executable PostgreSQL migration twice, atomic rollback/linking, shared/outsider access, stale saves, archive/restore, and RLS. Uses transient `@electric-sql/pglite@0.3.14` under `node_modules/.sql-verification` (not an application dependency).
- `deno check --no-config supabase/functions/project-rooms/index.ts supabase/functions/project-room-bridge/index.ts`.
- `deno test --no-config --allow-env supabase/functions/project-rooms/providers.test.ts supabase/functions/project-rooms/observability.test.ts`.
- `npx tsc --noEmit`, `npm run build`, and `tests/project-room-shared-browser.mjs` with local synthetic fixture. Desktop/mobile screenshots are under `tests/fixtures/project-room-shared-*.png`.

Production checks: existing research state hashes remained identical after migration; all 3 existing rooms were linked to prospects and creators retained ownership. A rolled-back database transaction verified create, archive/follow-up, restore, and sharing without leaving test rows. Anonymous API actions and invalid JWTs were rejected. All About Painting was shared with Sheree. The signed-in browser check encountered a browser connection timeout; Sheree’s own session and Slack delivery remain unverified. Layout browser fixtures passed including a real DOCX download. TypeScript, build, 28 Node tests, 6 provider/observability tests, and the executable PostgreSQL tests passed.

## Authorized release sequence

1. Confirm production release approval. Re-resolve the Trellis Switchboard binding (`horvjqqifgrzxesuxtfm` expected); review newer upstream changes before applying the isolated patch. Do not overwrite unrelated work. No commit or push without authorization.
2. Capture the current function versions, live frontend build ID, room/client/membership counts, and an approved recovery snapshot. Apply `20261107222523_project_room_shared_prospects.sql` through Switchboard. It is additive and idempotent, but creates prospect rows for existing rooms.
3. Deploy `project-rooms` and `project-room-bridge` through Switchboard, preserving their internal authentication and their individual `verify_jwt=false` gateway configuration. Deploy the matching frontend through the established release workflow.
4. Verify existing completed research and Word download. With real user sessions, verify Clint can share a room with Sheree, both can read/write, a third user is denied, and archive/follow-up works.
5. Configure the scoped reporting credential, room/recipient scope, and n8n error handling. Verify missing/wrong-key rejection and revoked recipient access. Run one manual digest; verify its content and Slack receipt in `#chief-channel`. Then publish the schedule.

Recovery: disable the n8n workflow and unset the bridge key hash to stop reporting. Restore previously captured function/frontend versions if needed. Keep additive tables and migrated data intact; do not drop prospects, membership rows, or meeting notes as a rollback shortcut. The prior creator-only backend may temporarily hide shared access, but preserves research data.

Lessons: polling must preserve unsaved form edits and their original version; HTTP success alone does not prove Slack delivery; a private Meetings connector is not an unattended server API.


Approved layout: Today, Companies, and a room with Overview / Notes & calls / Files / Research. Today counts come from saved rooms and follow-up dates. No sample tasks, timers, delivery stages, or financial ledger are rendered. The existing detailed research controls are under Research.

Feature ideas are available directly in the workspace navigation. Start a feature idea opens the existing product specification intake; all saved product rooms are listed regardless of research status. They do not require a company or create a prospect. The browser regression checks creation, reopening, research entry, and mobile width alongside company archive/restore and Word downloads.

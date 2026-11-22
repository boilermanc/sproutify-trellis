# Ownership-preserving YouTube metric batching

This follow-up preserves the batching work split from PR #8. It reduces one
existence query and write per metric to one bounded RPC call per batch.
The reviewed backend RPC is now applied to the intended Hub project
`horvjqqifgrzxesuxtfm`. The release connection recorded migration version
`20261122005820` with name `preserve_youtube_metric_ownership`; the repository
filename and test/workflow references now match that applied ledger entry. The
SQL bytes are unchanged. Do not replay the migration under its former timestamp.

The original live workflow was backed up and paused during the authorized release.
A bounded one-publication/one-day run failed at its shared n8n Google credential
before any metric writes. Reconnecting that shared credential is not the right
multi-channel fix: Trellis publishes to independently selected channel accounts.
The shared-account OAuth chooser was cancelled without selecting a channel.

The updated inactive blueprint calls the service-only `youtube-analytics` Edge
Function using the existing Hub Supabase credential. The function reloads each
live publication, uses its explicit `youtube_account_id`, resolves its existing
account credential internally, and verifies both the authenticated channel and
the video's channel before requesting analytics. Google tokens never enter the
workflow payload or execution logs. Publication/account/date inputs do not let
callers override ownership or redirect provider requests.

Per-publication `skipped` and `unavailable` results remain visible in the HTTP
node output, with a count warning from the row builder. Missing account mappings,
connection failures, scope errors, and delayed empty reports never produce fake
zero metric rows. Successful responses carry their own verified job identity, so
partial failures cannot shift metrics between Episode/Studio rows or channels.

Read-only production inspection on November 21, 2026 found two registered active
accounts (Rekkrd Listening Room and Rekkrd After Dark), three live Studio rows
explicitly assigned to Listening Room, and eight legacy live rows without an
account (seven Episode, one Studio). This fix does not guess or backfill those
eight destinations. Stored token expiry dates alone do not prove refresh grants
remain valid; the controlled runtime check must establish readiness.

`trellis_upsert_youtube_daily_metrics(p_rows jsonb)` accepts at most 500 input
rows. It executes as the caller with an empty search path and only grants
EXECUTE to service_role. Every input requires a video/date and one complete
Episode or Studio publication association. Invalid input rolls back the call.

For existing rows, conflict updates change metric fields, raw statistics, and
sync time only. All four existing provenance foreign keys and the original row
identity/creation time remain unchanged, including when the incoming source is
from the opposite pipeline. For new rows, first insertion chooses provenance;
later duplicate inputs update only metric values. Real unique-key locking
protects the same invariant when transactions compete.

The blueprint coalesces each video/date globally before chunking, retaining the
first source association and last metric payload. This prevents one key from
spanning independently scheduled HTTP batches. The RPC independently supports
ordered duplicate input, so correctness does not depend on this optimization.
The HTTP node sends `{p_rows: $json.rows}` to the RPC, never a full-row table upsert.

The conflict key is versioned in constants.ts SQL_SCHEMA, and a read-only
catalog query against the exact Hub project horvjqqifgrzxesuxtfm confirmed
UNIQUE(youtube_video_id, metric_date) on November 21, 2026. No metric rows were read.
The master schema includes the same RPC/grants as the additive migration.

Verification uses the actual versioned function on disposable PostgreSQL 17:
fixture, migration replay, ownership/permissions/bounds/rollback SQL regressions,
and competing transactions. JavaScript tests execute the blueprint batch code
for empty/boundary/mixed-source/duplicate cases and verify the RPC request graph.
These are isolated tests, not a live YouTube sync.

Remaining workflow release steps:

1. The backend-first migration is complete. Verify applied version
   `20261122005820` and the service-only RPC in the intended Hub project before
   workflow import; do not apply a duplicate migration under the old timestamp.
2. Import the inactive blueprint and select the existing Hub service-role
   Supabase credential on its RPC HTTP node. Anon/authenticated roles cannot call it.
3. Deploy the service-only `youtube-analytics` function before importing the
   updated inactive workflow. Assign the existing Hub service credential to its
   HTTP node. Do not connect a shared n8n Google credential.
4. Validate one explicitly mapped publication for one day. Confirm channel/video
   verification, useful coverage statuses, and ownership-preserving RPC writes
   when Analytics returns rows. Empty reports are not evidence of write success.
5. Restore the production Config (200 days, 75 publications per source) and remove
   the temporary global validation cap before publishing. Inspect coverage for
   unresolved legacy rows and channel-specific reconnect requirements.

The RPC is additive and does not backfill or reassign existing ownership. If
frontend/workflow rollout must be rolled back, retain the function and return to
the old inactive blueprint; do not delete customer metric rows or associations.

Lesson: bulk metric refreshes must preserve the old operation's foreign-key
semantics and be tested against existing records and concurrent conflicts.

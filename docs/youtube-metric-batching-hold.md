# Ownership-preserving YouTube metric batching

This follow-up preserves the batching work split from PR #8. It reduces one
existence query and write per metric to one bounded RPC call per batch.
The workflow remains inactive; no production migration or activation occurred.

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

Release separately, backend first:

1. Review/apply migration 20261122001240_preserve_youtube_metric_ownership.sql
   to the intended Hub project through the normal release process.
2. Import the inactive blueprint and select the existing Hub service-role
   Supabase credential on its RPC HTTP node. Anon/authenticated roles cannot call it.
3. Verify the intended YouTube OAuth channel and a controlled sync, then activate
   only as part of an approved release. No extra access credential is created here.

The RPC is additive and does not backfill or reassign existing ownership. If
frontend/workflow rollout must be rolled back, retain the function and return to
the old inactive blueprint; do not delete customer metric rows or associations.

Lesson: bulk metric refreshes must preserve the old operation's foreign-key
semantics and be tested against existing records and concurrent conflicts.

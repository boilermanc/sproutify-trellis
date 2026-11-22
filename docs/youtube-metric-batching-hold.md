# YouTube metric batching — draft, not ready to merge

This preserves the batching proposal removed from PR #8. It reduces per-row
existence checks and writes to bounded batches and deduplicates video/date keys
before writing. **The HTTP upsert node is disabled and the workflow is inactive.**

Independent review found that a direct full-row upsert changes ownership
semantics. The original update node refreshed metric fields while leaving the
existing episode/publication and studio-album/publication associations intact.
The proposed full-row operation can replace or null those associations when a
video is shared between pipelines, including when only one source appears in the
current sync. Deduplicating current inputs does not protect existing database
associations; reading before writing alone also leaves a concurrency race.

Before enabling writes or marking this PR ready:

- Implement an atomic ownership-preserving batch operation, likely a narrowly
  permissioned database RPC whose conflict update changes metric fields only.
- Define deterministic behavior for a new video/date appearing in multiple
  publication sources; fail safely on ambiguous ownership if necessary.
- Add isolated database tests for existing episode-to-studio and studio-to-episode
  updates, absent sources, duplicate mixed-source inputs, retries, and concurrent
  insert/update attempts. All existing non-null source associations must survive.
- Verify required permissions and deploy the database operation before importing
  and enabling the updated n8n write node.

The conflict key is not missing: `constants.ts` SQL_SCHEMA declares
`UNIQUE (youtube_video_id, metric_date)`, and a read-only catalog query against
the exact Hub project `horvjqqifgrzxesuxtfm` confirmed constraint
`trellis_youtube_daily_metrics_youtube_video_id_metric_date_key` on November21,
2026. No metric rows or production schema were changed.

The offline JavaScript tests cover only batching, key validation and the disabled
write gate. They do not establish the missing database ownership guarantees.
Do not merge or activate this draft based on those tests alone.

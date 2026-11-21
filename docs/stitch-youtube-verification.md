# Stitch and YouTube fixes

PR #8 now preserves only work absent from current main: the stitch worker decodes
one input at a time, and the YouTube workflow upserts bounded batches instead of
performing one existence check and write per metric. Duplicate video/date keys
are collapsed before batching, keeping the last observed row as the old sequence
of updates did. Existing analytics, email, and deployment code comes from main.

Run the offline regressions:

```sh
python -m unittest discover -s tests -p test_stitch_memory.py -v
node --test tests/youtube-metric-batches.test.mjs tests/youtube-publication-targeting.test.mjs tests/youtube-oauth-contract.test.mjs
```

The long-album test tracks live decoded input objects and rejects downloading a
third input while previous inputs remain retained. It executes the production
stitch function with synthetic audio/storage doubles and no provider calls.
Batch tests execute the blueprint's actual code for empty, boundary, duplicate,
and multi-source metric sets. These checks do not measure production peak RSS or
perform a live YouTube/Supabase sync.

The worker still holds the growing master and temporary append buffers, so its
memory use grows with album duration. Sequential decoding removes the additional
list of all decoded inputs; it does not make arbitrarily long albums constant
memory. A disk-based ffmpeg pipeline would be a separate change.

Deployment remains separate: deploy the worker normally, then import the updated
blueprint into n8n and select the existing Hub Supabase credential on the HTTP
upsert node. This PR does not activate workflows or write production metrics.

Lesson: upsert batching must deduplicate conflict keys before chunking; Postgres
cannot update a target row twice within a single upsert statement.

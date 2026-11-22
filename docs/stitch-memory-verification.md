# Stitch input memory fix

PR #8 now preserves only the independently verified stitch worker fix absent
from current main. The worker decodes and merges one input at a time instead
of retaining every decoded input together with the growing master.

Run the offline regressions:

```sh
python -m unittest discover -s tests -p test_stitch_memory.py -v
```

The long-album test tracks live decoded input objects and rejects downloading a
third input while previous inputs remain retained. It executes the production
stitch function with synthetic audio/storage doubles and no provider calls.
It fails against unchanged main and passes with the fix. Additional cases cover
a single track, no playable inputs, and download failure without upload.

The worker still holds the growing master and temporary append buffers, so its
memory use grows with album duration. Sequential decoding removes the additional
list of all decoded inputs; it does not make arbitrarily long albums constant
memory. A disk-based ffmpeg pipeline would be a separate change.

Production peak RSS was not measured, and deployment remains a separate release
step. No worker was deployed or production render invoked by this PR refresh.

The separate YouTube batching follow-up preserves the old update path's source
associations through an atomic database operation. It is intentionally separate
from this memory fix so database migration/deployment acceptance cannot delay or
be mistaken for validation of this Python change. Current main's analytics,
email, n8n workflow and deployment behavior are retained here.

Lesson: bounded batching needs database ownership and concurrency tests, not
only in-memory deduplication; a bulk full-row update must preserve the original
foreign-key associations when the old update changed only metric fields.

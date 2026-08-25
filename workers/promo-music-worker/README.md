# Promo music worker boundary

This directory is intentionally not executable yet. Promo Studio now creates a
server-authoritative, instrumental `music_generate` job, but the deployed worker
must continue claiming only `noop` jobs.

Trellis already has working Lyria integrations. A Promo adapter may reuse their
server-side provider call and asynchronous execution patterns only after it:

- maps the opaque `music_profile_id` to provider/model configuration on the server;
- treats the manifest target as required coverage while recording measured audio duration;
- writes masters and previews to Promo Studio's private `promo-assets` bucket;
- creates `promo_assets` and `promo_music_takes` rows and an immutable manifest revision;
- keeps the bed strictly instrumental and rejects lyrics, named-artist imitation, and unsupported prompt material;
- records provider IDs, cost, retries, checksum, MIME type, licensing/provenance, and failure codes;
- derives cue markers from approved phrase IDs without accepting browser timing or prompts.

The existing browser webhook and public/session storage paths are not valid
Promo Studio persistence boundaries and must not be called directly.

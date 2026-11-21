# Promo Music Worker

This directory contains an executable Node 22 worker for server-authoritative
`music_generate` jobs. It remains default-off through
`PROMO_MUSIC_CLAIMS_ENABLED` and claims only music jobs when enabled.

Trellis already has working Lyria integrations. A Promo adapter may reuse their
server-side provider call and asynchronous execution patterns only after it:

- maps the opaque `music_profile_id` to provider/model configuration on the server;
- treats the manifest target as required coverage while recording measured audio duration;
- writes a deterministic `music.wav` master to Promo Studio's private
  `promo-assets` bucket with the required checksum/job metadata;
- keeps the bed strictly instrumental and rejects lyrics, named-artist imitation, and unsupported prompt material;
- records provider IDs, cost, retries, checksum, MIME type, licensing/provenance, and failure codes;
- derives cue markers from approved phrase IDs without accepting browser timing or prompts.

The worker resolves opaque sonic-profile IDs through
`PROMO_LYRIA_PROFILE_MAP_JSON`, sends a strict instrumental prompt to the
server-selected Lyria model, normalizes the result to stereo 48 kHz PCM WAV
with FFmpeg, uploads an immutable private object, and calls only
`complete_promo_music_generation_job`. The existing browser webhook and
public/session storage paths remain invalid Promo Studio boundaries.

Install with `npm ci`. Copy `promo-music.env.example` to
`/etc/trellis/promo-music.env`, configure the profile map and executable paths,
then run `npm run once` while claims remain disabled. Enable claims only for a
controlled smoke job; the operator still approves the result in Promo Studio.

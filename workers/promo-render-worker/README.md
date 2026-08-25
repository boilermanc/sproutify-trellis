# Promo render worker boundary

This directory now contains a non-claiming worker preflight and private-asset
download boundary. Promo Studio creates server-authoritative `preview_render`
and `final_render` jobs, but production claims remain disabled and the deployed
worker continues claiming only `noop` jobs.

Run the deterministic local inspection from the repository root:

```bash
node workers/promo-render-worker/scripts/dry-run.mjs
```

The inspection verifies claim ownership and lease, the canonical input
fingerprint, the pinned composition source, current project revision, selected
preview approval, UUID-only private asset references, bounded object paths and
sizes, and byte-for-byte download checksums. It reports every remaining
activation blocker without claiming or mutating a production job.

The PS-002 `PromoProof` composition proved the Remotion and FFmpeg toolchain,
but it still contains Rekkrd-specific styling and is not a production template
for every branch. The server now pins composition keys and versions in the
branch-aware registry at `supabase/functions/_shared/promo-compositions.ts`.
The Rekkrd proof is allowlisted only for Rekkrd, and the branch-neutral
`vertical-ui-story@v1` contract is reserved for every branch. Both remain
worker-disabled. The generic component's LF-normalized UTF-8 source fingerprint
is pinned in the registry, so its implementation cannot change without a
versioned contract update. Before enabling render claims, Trellis still needs:

- promotion of the implemented `vertical-ui-story@v1` composition from visual proof to a registry-approved worker build;
- Remotion rendering isolated from the Supabase Edge Function runtime;
- FFmpeg two-pass loudness normalization to -14 LUFS / -1.5 dBTP;
- exact H.264 High, yuv420p, AAC 48 kHz, TV-range, fast-start finalization;
- ffprobe verification for 1080x1920, 30 fps, duration, streams, codecs, and color range;
- output checksum, measured loudness, tool fingerprints, cost, retries, and provenance audit data;
- immutable manifest revision plus private preview/final `promo_assets` registration.

The private download boundary and post-claim preflight revalidation are implemented,
so a queued final job cannot outlive a revoke or preview selection change.
Activation remains blocked until the registry enables the composition, the
server job contains approved cross-branch presentation data, and the generic
FFmpeg pipeline receives its own approved fingerprint.

The worker must accept only asset IDs and normalized timeline data from the
server-created job. It must never accept browser URLs, storage paths, captions,
FFmpeg flags, composition source, executable code, or credentials.

## Completion transaction

After rendering and QA, the worker must generate two UUIDs and upload only to
these deterministic private paths:

- `<project_id>/<render_asset_id>/preview.mp4` for `preview_render`, or
  `<project_id>/<render_asset_id>/final.mp4` for `final_render`;
- `<project_id>/<qa_asset_id>/qa.json` for the machine-readable QA report.

Each upload must set Storage custom metadata containing `sha256`, `job_id`,
`input_fingerprint`, and `kind`. The QA upload must also include
`payload_fingerprint_sha256`, calculated as SHA-256 over the UTF-8 PostgreSQL
JSONB text representation of the submitted QA object. That representation
removes duplicate keys, orders keys using PostgreSQL JSONB ordering (UTF-8 byte
length, then byte value), normalizes numbers, and uses one ASCII space after
each comma and colon. The worker must upload those exact canonical UTF-8 bytes
as `qa.json`; its `sha256` and `payload_fingerprint_sha256` metadata values must
therefore be identical. Upload with `contentType: video/mp4` or
`application/json` as appropriate and without upsert.

The `duration_seconds`, `integrated_lufs`, and `true_peak_dbfs` JSON numbers
must use plain decimal notation: no exponent, no leading zero (except zero
itself), and no trailing zero in a fractional part. For example, use `10.5`,
not `10.50` or `1.05e1`. This preserves identical numeric text in JavaScript
and PostgreSQL JSONB.

It must then call `complete_promo_render_job` with the active worker lease,
checksums, sizes, measured duration, output fingerprint, and QA report. That
service-role-only RPC verifies object presence and the delivery profile before
binding the reported checksums and sizes to Storage metadata, atomically
registering both assets, completing the attempt and job, and writing the audit
event. Render workers must not use the generic `complete_promo_job`
RPC. A `false` result means the lease or contract is invalid; the worker must
not report success.

The QA report must contain `schema_version`, `passed`, `input_fingerprint`,
`output_checksum_sha256`, `ffmpeg_fingerprint`, `width`, `height`, `fps`,
`video_codec`, `pixel_format`, `audio_codec`, `audio_sample_rate`, `faststart`,
`color_range`, `duration_seconds`, `integrated_lufs`, and `true_peak_dbfs`.
Measured and reported durations must agree within 0.001 seconds, and measured
duration must be within 0.05 seconds of `timeline.target_seconds`.

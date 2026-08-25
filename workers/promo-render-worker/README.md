# Promo render worker boundary

This directory is intentionally not executable yet. Promo Studio now creates
server-authoritative `preview_render` and `final_render` jobs, but the deployed
worker must continue claiming only `noop` jobs.

The PS-002 `PromoProof` composition proved the Remotion and FFmpeg toolchain,
but it still contains Rekkrd-specific styling and is not a production template
for every branch. Before enabling render claims, Trellis needs:

- a versioned, branch-neutral composition registry; unknown composition keys must fail closed;
- private `promo-assets` downloads resolved by asset ID immediately before rendering;
- Remotion rendering isolated from the Supabase Edge Function runtime;
- FFmpeg two-pass loudness normalization to -14 LUFS / -1.5 dBTP;
- exact H.264 High, yuv420p, AAC 48 kHz, TV-range, fast-start finalization;
- ffprobe verification for 1080x1920, 30 fps, duration, streams, codecs, and color range;
- output checksum, measured loudness, tool fingerprints, cost, retries, and provenance audit data;
- immutable manifest revision plus private preview/final `promo_assets` registration.

The worker must accept only asset IDs and normalized timeline data from the
server-created job. It must never accept browser URLs, storage paths, captions,
FFmpeg flags, composition source, executable code, or credentials.

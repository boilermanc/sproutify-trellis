# Promo voice worker boundary

This directory is intentionally not executable yet. The user API now creates
provider-neutral, server-authoritative `voice_generate` and `voice_align` job
inputs, but the deployed worker must continue claiming only `noop` jobs.

Before enabling either job type, Trellis still needs:

- a production voice provider decision;
- a server-side mapping from the manifest's opaque `voice_profile_id` to the
  provider, model, voice ID, settings, and credentials;
- private Storage download/upload handling for voice masters and alignment;
- provider response normalization into phrase/word timing with confidence;
- immutable manifest revision and `promo_voice_takes` persistence;
- cost, retry, timeout, cancellation, and provider-id audit handling.

The worker must synthesize `speech_text`, never `display_text`. It must not
accept provider settings, credentials, text, asset paths, or timing thresholds
from a browser request.

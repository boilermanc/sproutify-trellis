# Promo voice worker

This branch-neutral Node worker claims only server-authored `voice_generate`
and `voice_align` jobs. It heartbeats its lease, uploads deterministic private
`voice.wav` and `alignment.json` objects, and completes through the dedicated
service-role-only atomic RPCs. Claims are disabled by default.

Each manifest carries an opaque, branch-derived `voice_profile_id` plus the
approved Brand Identity delivery guidance. The VPS can map profile IDs to
Gemini voices with `PROMO_GEMINI_VOICE_MAP_JSON`; unmapped profiles use
`PROMO_GEMINI_TTS_VOICE` (default `Kore`). Credentials and voice mappings remain
server-side and never enter browser-authored jobs.

Narration is synthesized one approved phrase at a time and concatenated with a
bounded gap. That makes the recorded phrase boundaries exact properties of the
generated WAV rather than timing estimates. `voice_align` reloads the current
take and audio asset, verifies those immutable segment timings against the
approved phrase IDs, then writes canonical PostgreSQL-JSONB bytes. Word timing
remains empty until a trustworthy word-alignment provider is added; captions
use the exact phrase boundaries.

Completion and adoption are implemented. Generation calls
`complete_promo_voice_generation_job`; alignment calls
`complete_promo_voice_alignment_job`. The operator then adopts the voice master,
queues alignment, and approves the aligned result through Promo Studio. Workers
must never use the generic `complete_promo_job` for either result.

The worker synthesizes `speech_text`, never `display_text`. It does not
accept provider settings, credentials, text, asset paths, or timing thresholds
from a browser request.

## Run once for verification

```bash
cd /opt/trellis
export SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<HUB service_role key>
export GEMINI_API_KEY=<server-side Gemini key>
export PROMO_GEMINI_TTS_VOICE=Kore
export PROMO_GEMINI_VOICE_MAP_JSON='{"<brand-identity-id>:voice-v1":"Charon"}'
export PROMO_VOICE_CLAIMS_ENABLED=true
npm run promo:voice-worker -- --once
```

Do not enable claims until the Promo Studio migrations, atomic RPCs, and private
`promo-assets` bucket are deployed. Run without `--once` under a process manager
after the one-job verification succeeds.

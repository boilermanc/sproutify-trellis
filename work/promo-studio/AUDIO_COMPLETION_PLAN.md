# Promo Studio audio completion and adoption plan

Updated: 2026-08-26

## Objective

Complete voice generation, voice alignment, and instrumental music generation
without allowing a browser or provider adapter to mutate an active Promo
Manifest. Workers finish leased jobs atomically on the source revision. An
operator then adopts verified results into a new immutable child revision.

## Existing reusable contracts

- `promo_jobs` and `promo_job_attempts` already provide filtered claims, lease
  identity, retries, cancellation, fingerprints, and audit linkage.
- `promo_voice_takes` and `promo_music_takes` already constrain take number,
  direction, selection, status, provider metadata, duration, and output assets.
- `promo_assets` plus the private `promo-assets` bucket already provide
  immutable object identity, checksums, byte counts, MIME types, and provenance.
- `promo_revision_assets` preserves asset origin and explicitly binds adopted
  assets to child revisions.
- Voice queue input already uses approved `speech_text`, pronunciation data,
  an opaque voice profile, and a server-reserved take number.
- Music queue input is structured, phrase-bound, strictly instrumental, and
  provider-neutral, with a server-reserved take number.

## Increment 1: atomic worker completion

Add service-role-only RPCs with an empty search path:

1. `complete_promo_voice_generation_job`
   - Lock one active `voice_generate` lease on the current project revision.
   - Verify the job input fingerprint, take number, direction, opaque profile,
     deterministic private audio/provider-response paths, Storage versions,
     MIME type, checksum metadata, and byte counts.
   - Reject nonpositive or over-target measured duration.
   - Insert `voice_master` and optional `provider_response` assets plus one
     unselected `promo_voice_takes` row in `aligning` status.
   - Complete the attempt/job and write `job.succeeded` atomically.
2. `complete_promo_voice_alignment_job`
   - Lock one active `voice_align` lease and reload the referenced generated
     take and audio asset on the current revision.
   - Verify every approved phrase appears exactly once, timing is ordered and
     bounded by measured audio duration, and every confidence meets the
     manifest/job threshold.
   - Verify the exact JSONB bytes and deterministic private alignment object.
   - Insert a `voice_alignment` asset and update the normalized take to `ready`.
3. `complete_promo_music_generation_job`
   - Lock one active `music_generate` lease on the current project revision.
   - Revalidate `instrumental=true`, the structured brief, target coverage,
     reserved take number, and direction.
   - Verify deterministic private master/provider-response objects, MIME type,
     checksums, byte counts, measured duration, and provider lineage.
   - Require cue markers to reference only approved phrase IDs and remain inside
     the measured duration.
   - Insert `music_master` and optional `provider_response` assets plus one
     unselected ready `promo_music_takes` row, then complete job/attempt/audit.

All RPCs must revoke execution from `PUBLIC`, `anon`, and `authenticated`, grant
only `service_role`, and roll back every insert if any validation fails.

## Increment 2: immutable adoption

- Add browser actions that accept only a normalized take UUID; never accept
  provider IDs, asset IDs, timing, cue markers, prompts, or settings.
- Reload the active source revision, succeeded job audit, ready take, exact
  assets, and revision bindings server-side.
- Create a child revision that carries forward existing bindings and adds:
  - voice take plus word/phrase timing, selected take ID, timing source, audio
    and alignment assets; or
  - music take plus cue markers, selected take ID, duration, and master asset.
- Mark adopted asset provenance unapproved. Voice/music review remains a
  separate explicit approval gate before final rendering.
- Preserve the parent manifest and original `promo_assets.revision_id` values.

## Increment 3: provider-independent executors

- Implement preflight/executor modules with injected provider, secret, Storage,
  heartbeat, completion, and cleanup adapters.
- Keep production claims disabled until the provider mapping and credentials are
  configured server-side.
- Voice synthesis must consume `speech_text`; captions and UI keep
  `display_text` unchanged.
- Music must remain instrumental and reject lyrics, named-artist imitation, and
  provider/browser prompt overrides.

## External decisions that remain intentionally unresolved

- Production voice provider, model, voice IDs, profile mapping, credentials,
  pricing, and pronunciation-control syntax.
- Production Lyria endpoint/model configuration, credentials, licensing record,
  asynchronous polling policy, and cost reporting.
- Worker host, service account, process supervision, alerting, and the explicit
  claim-enable switches for each job type.

None of these decisions are required to implement or test the database,
adoption, and provider-adapter boundaries above.

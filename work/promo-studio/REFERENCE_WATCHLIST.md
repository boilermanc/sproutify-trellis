# Promo Studio reference watchlist

This is the ongoing record for external systems and ideas that may improve Promo
Studio. Entries are references, not dependencies or changes to the requirements.
Trellis remains server-authoritative, branch-aware, evidence-bound, and
provider-neutral.

## OpenMontage

- Reviewed: 2026-08-26
- Source: https://github.com/calesthio/OpenMontage
- Status: reference only; do not vendor or copy implementation code
- License note: AGPL-3.0. Any direct reuse, modification, embedding, or service
  integration requires deliberate licensing review.

### Patterns worth revisiting

1. **Browser capture craft** — deterministic viewport and recording size,
   deliberate action pacing, navigation-safe recording, cursor/click treatments,
   and WebM-to-MP4 finishing. Apply only inside Trellis's stronger fixture,
   route, assertion, PII, checksum, and provenance boundary.
2. **Provider adapters** — capability discovery, explicit availability,
   fallbacks, model/provider metadata, cost estimates, and structured failures.
   Compare these patterns when implementing Trellis voice and music workers.
3. **Living storyboard** — stage state, scene cards, generated assets, approvals,
   costs, event history, and completed-run replay. Revisit when Promo Studio's
   review workspace moves beyond the current job and gate views.
4. **Creative sampling** — approve one representative hero scene before batch
   generation and reuse a small overlay kit instead of generating one-off
   callouts for every interaction.
5. **Production QA** — compare its frame sampling, subtitle checks, audio
   analysis, delivery promises, and estimated-versus-actual cost reporting with
   Trellis's existing delivery profile and immutable QA artifacts.

### Boundaries that must not change

- The coding agent must not become the production control plane.
- Browser inputs must not supply routes, credentials, selectors, executable
  code, provider settings, storage paths, or FFmpeg flags to workers.
- Repository evidence, capture environments, fixture/auth profiles, assertions,
  approvals, leases, private assets, and completion remain server-resolved.
- OpenMontage does not replace Trellis Supabase queues, RLS, immutable manifest
  revisions, branch mappings, or atomic worker completion.

### Revisit points

- Capture worker: inspect the Playwright guidance as a recording-quality
  checklist after Trellis preflight and atomic completion are locked.
- Voice/music workers: compare Google TTS, Lyria, selector, and cost metadata
  behavior without adopting provider defaults or claims.
- Review UI: consider a Trellis-native living storyboard and run replay backed
  by `promo_events`, revisions, jobs, approvals, and private assets.
- Evaluation: if useful, run OpenMontage separately against sanitized proof
  assets as a quality benchmark; do not connect it to production credentials or
  make it part of the Trellis runtime.

### Source links

- Architecture: https://github.com/calesthio/OpenMontage/blob/main/docs/ARCHITECTURE.md
- Screen-demo pipeline: https://github.com/calesthio/OpenMontage/blob/main/pipeline_defs/screen-demo.yaml
- Playwright recording guidance: https://github.com/calesthio/OpenMontage/blob/main/.agents/skills/playwright-recording/SKILL.md
- Backlot storyboard: https://github.com/calesthio/OpenMontage/tree/main/backlot
- License: https://github.com/calesthio/OpenMontage/blob/main/LICENSE

## Entry template

- Reviewed: YYYY-MM-DD
- Source:
- Status: reference only / evaluate / rejected
- Useful patterns:
- Trellis boundaries:
- Revisit point:
- License/security notes:

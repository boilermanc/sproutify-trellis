# PS-002 — Rekkrd evidence, staging capture, and 10-second proof

This is the Milestone 0 spike for Trellis Promo Studio. It is deliberately
isolated from the Trellis application, database, and production worker queues.
It exercises a real Rekkrd component capture, Google Gemini TTS, Google Lyria,
and the existing Remotion/FFmpeg toolchain while retaining fail-closed
provenance checks.

The proof architecture is branch-neutral. Rekkrd is the reference manifest, not
a renderer specialization: `project.branch_slug`, evidence, capture scenario,
script, audio, captions, brand treatment, and provenance are inputs. The same
contract and composition can be used by every Trellis branch without adding a
branch condition to the worker.

## Verified Trellis evidence

- Trellis branch: `rekkrd` (`f609040b-3098-4bb1-93b1-aabf5e910fd7`).
- Public site: `https://rekkrd.com`.
- Candidate route already referenced by Trellis:
  `https://rekkrd.com/listening-room`.
- Rekkrd is positioned in Trellis's checked-in content strategy as a collection
  management companion with two-way Discogs sync, not a Discogs replacement.
- The public candidate route was checked on 2026-08-25. It returned the Rekkrd
  marketing homepage, not a verified authenticated Listening Room product state.
- No Rekkrd repository mapping, staging environment, fixture account, capture
  auth profile, or stable selectors were present in the Trellis checkout before
  this spike.

## Rekkrd repository spike result

- Local checkout resolved to `C:/Users/clint/Documents/Github/crowe_collection`.
- GitHub repository: `boilermanc/rekkrd`, branch `main`, base commit
  `64bff1062609df08de827884328a64ffada01d63`.
- The repo already provides a development-only `/preview` route built from real
  application components and checked-in synthetic fixtures.
- PS-002 captured `StakkdScreen` through
  `/preview?screen=Stakkd&capture=1`; no login or customer data was needed.
- `StakkdScreen.tsx` now uses Rekkrd's existing category-icon registry instead
  of random Picsum photos when a gear item has no real thumbnail. The capture
  records both the base commit and SHA-256 of that exact uncommitted diff.
- The checked-in capture script blocks service workers and asserts the Stakkd
  heading, fixture text, zero rendered fixture images, and at least five SVG
  icons before saving a screenshot.

See `evidence/rekkrd-evidence.json` for the machine-readable evidence record and
`scenarios/rekkrd.listening_room.overview.json` for the blocked capture contract.

## Reuse inventory

| Need | Existing Trellis capability | PS-002 decision |
|---|---|---|
| Vertical composition | `workers/clip-render-worker` and Remotion 4 | Add an isolated `PromoProof` entry point; do not change production composition registration. |
| Captions | `MediaFinishing.tsx` and timed-text UI contracts | Use measured cue boundaries in the proof manifest. |
| Final encode and QA | `worker.mjs` FFmpeg/ffprobe patterns | Finalize H.264/AAC, `yuv420p`, CFR 30, `+faststart`, then validate with ffprobe. |
| Music generation | `generate-session-track`, `services/musicService.ts`, music queues | Reuse Google Lyria 3; PS-002 generated one proof-only clip directly without writing Hub rows. |
| Brand evidence | `.trellis/spec/projects/rekkrd`, brand services, asset library | Reuse only checked-in facts; do not infer unseen product UI or claims. |
| Capture storage | Private media-generation bucket and signed assets | Reuse the pattern later; do not upload a foundation placeholder. |
| Publishing | Clip, Motion Post, YouTube/social rails | Out of scope until final approval and a real master exist. |

## Files in the slice

- `manifest/proof-manifest.json` — ten-second timebase, captions, evidence refs,
  separate VO/music stems, and the currently blocked capture source.
- `scenarios/rekkrd.listening_room.overview.json` — declarative capture scenario
  with unresolved fields represented as `null`, never invented values.
- `assets/rekkrd-stakkd-preview.png` — asserted real-component capture using a
  checked-in synthetic gear fixture.
- `assets/gemini-voice-kore.wav` — Gemini 2.5 Flash Preview TTS proof take.
- `assets/lyria-stakkd-bed.mp3` — Lyria 3 Clip Preview instrumental proof take.
- `scripts/create-local-audio.ps1` — creates a local Windows sample VO and a
  synthetic instrumental timing bed. Neither is provider-approved media.
- `scripts/render-proof.mjs` — validates provenance, renders Remotion, performs
  FFmpeg finalization, and writes ffprobe QA JSON.
- `scripts/capture-ui.mjs` — reusable source-repo capture harness with DOM
  assertions and service-worker blocking.
- `scripts/generate-google-voice.mjs` and `scripts/generate-lyria-bed.mjs` —
  proof-only real-provider generators; credentials remain server-side.
- `scripts/proof-contract.mjs` — reusable validation and stable error codes.
- `workers/clip-render-worker/proofs/ps-002/*` — isolated composition entrypoint.
- `tests/promo-proof-contract.test.mjs` — fail-closed provenance and output QA tests.

## Local foundation render

From the repository root:

```powershell
cd workers/clip-render-worker
npm ci
cd ../..
powershell -ExecutionPolicy Bypass -File work/promo-studio/ps-002/scripts/create-local-audio.ps1
node work/promo-studio/ps-002/scripts/render-proof.mjs --allow-foundation-assets
```

During finalization-only iteration, `--reuse-remotion` reuses an existing
intermediate render; manifest provenance validation still runs first.

Another branch supplies its own manifest with `--manifest <path>`. It must meet
the same truthfulness and delivery contract; no branch receives a weaker PII or
capture-provenance gate.

The verified Rekkrd Stakkd proof renders without the foundation override:

```powershell
node work/promo-studio/ps-002/scripts/render-proof.mjs
```

The output is `output/ps-002-rekkrd-vertical.mp4`; its QA report is written next
to it. The foundation override remains available only for deliberately blocked
manifests and cannot satisfy the real-provider final contract.

## Exact blockers requiring Clint's input

- [x] Rekkrd repository and commit identified for the spike.
- [x] Real Stakkd component captured from a checked-in synthetic dev fixture.
- [x] The selected fixture contains no customer PII and requires no auth profile.
- [x] Real Gemini TTS take generated with model and voice provenance.
- [x] Real Lyria 3 Clip Preview bed generated with prompt and interaction ID.
- [x] Remotion render and FFmpeg delivery QA passed.
- [ ] Commit or otherwise approve the Rekkrd category-icon fallback; current
      capture provenance includes the exact uncommitted diff checksum.
- [ ] Staging/capture base URL and permission for authenticated product capture.
- [ ] Dedicated fixture-account login method for Listening Room/import flows.
- [ ] Stable `data-testid` selectors and PII masks for authenticated scenarios.
- [ ] Permission to display Discogs text, logo, or UI. Default: no Discogs UI/logo.
- [ ] Approve the Kore proof voice or choose another Google prebuilt voice. The
      current timing uses FFmpeg silence detection plus manual phrase alignment.
- [ ] Deploy and end-to-end verify the existing `generate-session-track` Edge
      Function before shared Promo queues depend on it. The older n8n blueprint
      remains scaffold-only and must not be used.
- [ ] Replace the invalid local `.env.local` Gemini key; PS-002 succeeded through
      the existing Hub `tenant_secrets` server-side fallback without exposing it.
- [ ] Confirm the canonical provider/product name: `Lyria` (current code) or
      user-facing `Lyra`.
- [ ] Confirm whether the existing clip-render worker should ultimately claim
      Promo jobs or whether Promo receives a separate service.

## Concrete implementation plan after unblock

1. **Evidence pinning:** connect the Rekkrd repo read-only; store repo, commit,
   permitted paths, route evidence, and selector evidence in the capture manifest.
2. **Capture:** add Playwright to a new `workers/promo-capture-worker`; keep the
   auth state encrypted server-side; run the approved fixture scenario at a
   high-resolution source viewport; collect video, trace, assertions, masks,
   console/network failures, checksum, and commit/environment metadata.
3. **Voice:** add a server-side provider adapter configured with
   `PROMO_TTS_PROVIDER`, provider API secret, licensed voice ID, and alignment
   mode. Save lossless WAV plus word/phrase timing and confidence.
4. **Music:** submit a storyboard-derived instrumental take through the existing
   `music_generations` path after its scaffolded Lyria node is verified; retain
   the provider prompt/job ID and selected take.
5. **Composition:** replace the blocked visual with the verified capture, update
   caption cues from the selected voice timing, and render `PromoProof`.
6. **Finalization:** duck the music under VO, normalize to the approved target,
   encode H.264 High/yuv420p/AAC 48 kHz with faststart, and run the PS-002 QA.
7. **Storage:** only after real capture exists, add a private `promo-assets`
   bucket and the Promo foundation migration in Milestone 1. No migration is
   required or appropriate for this isolated spike.

### Future configuration and credentials

| Setting | Purpose | Location |
|---|---|---|
| `REKKRD_REPOSITORY` / pinned SHA | Evidence scan | Server/worker only |
| `REKKRD_CAPTURE_BASE_URL` | Capture target | Capture worker only |
| encrypted capture auth profile | Fixture session | Server-side secret storage |
| `PROMO_TTS_PROVIDER` and provider key | VO synthesis | Edge/worker secret only |
| licensed voice ID | Deterministic voice selection | Promo manifest/provider config |
| existing Supabase URL/service role | Queue/private assets | Worker only; never browser |
| existing Lyria/n8n connection | Music generation | Existing server-side path |

No credentials are added to this repository by PS-002.

## Cross-branch design rules

- Branch identity and brand tokens are data, never worker conditionals.
- Capture scenarios are namespaced (`{branch}.{feature}.{state}`) and versioned.
- Credentials/auth profiles are referenced by opaque server-side keys, not
  embedded in manifests.
- Claims and visible copy cite evidence owned by the selected branch.
- Storage paths begin with organization and project IDs, so branches cannot
  collide or read one another's captures.
- Shared renderer, voice, music, QA, and publishing adapters accept provider-
  neutral contracts. A branch may choose different configured providers/takes.
- Every branch uses the same strict real-capture, PII, caption, and ffprobe gates.

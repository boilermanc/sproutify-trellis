# Promo Capture Worker

This directory contains the provider-independent preflight/executor, a bounded
Playwright browser adapter, and a continuous Node 22 polling runtime. Production claims remain disabled and must
not be enabled until all of the following are configured:

- an active branch source with an HTTPS `capture_base_url`;
- an opaque server-side `capture_fixture_key`;
- an optional opaque `capture_auth_profile_key` when the fixture requires authentication;
- a script-approved immutable Promo Manifest revision;
- pinned repository evidence whose commit matches the capture scenario;
- a verified route and at least one declarative assertion;
- isolated worker storage and a private `promo-assets` upload path.

The browser can submit only a scenario ID. `promo-studio` resolves the authoritative manifest and branch source server-side and writes a secret-free job payload containing scenario/source identifiers and the expected commit. `preflight.mjs` reloads and binds that claim to the current project revision, active branch source, pinned scenario, public HTTPS environment, fixture/auth profile keys, viewport, selectors, masks, and assertions. `executor.mjs` resolves secrets only through injected worker adapters, verifies capture output, uploads immutable video/still/trace artifacts, and uses `complete_promo_capture_job` for atomic registration.

The runtime resolves fixture/auth profiles only from server environment maps,
blocks service workers and cross-origin document navigation, applies declared
masks, executes only the supported assertion vocabulary, scans visible text for
obvious PII/secrets, records with the configured Chromium executable, and uses
FFmpeg to produce the required MP4. Secrets are never included in artifacts.
The VPS service must also run with an egress policy that denies loopback,
link-local, cloud-metadata, and private-network destinations; the adapter's URL
checks are defense in depth and do not replace network isolation against DNS
rebinding.

Install with `npm ci`. Copy `promo-capture.env.example` to
`/etc/trellis/promo-capture.env`, populate the two JSON maps and executable
paths, and run `npm run once` with claims disabled to verify the kill switch.
Enable `PROMO_CAPTURE_CLAIMS_ENABLED=true` only for a controlled smoke job.

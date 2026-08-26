# Promo Capture Worker foundation

This directory now contains a provider-independent preflight and executor for a
future Playwright capture adapter. Production claims remain disabled and must
not be enabled until all of the following are configured:

- an active branch source with an HTTPS `capture_base_url`;
- an opaque server-side `capture_fixture_key`;
- an optional opaque `capture_auth_profile_key` when the fixture requires authentication;
- a script-approved immutable Promo Manifest revision;
- pinned repository evidence whose commit matches the capture scenario;
- a verified route and at least one declarative assertion;
- isolated worker storage and a private `promo-assets` upload path.

The browser can submit only a scenario ID. `promo-studio` resolves the authoritative manifest and branch source server-side and writes a secret-free job payload containing scenario/source identifiers and the expected commit. `preflight.mjs` reloads and binds that claim to the current project revision, active branch source, pinned scenario, public HTTPS environment, fixture/auth profile keys, viewport, selectors, masks, and assertions. `executor.mjs` resolves secrets only through injected worker adapters, verifies capture output, uploads immutable video/still/trace artifacts, and uses `complete_promo_capture_job` for atomic registration.

No Playwright dependency, browser runtime, secret-store implementation, or
production polling loop is installed by this slice. The eventual capture
adapter must block service workers, prevent uncontrolled navigation, apply all
masks, execute only supported declarative assertions, and return no secrets.

Until a capture environment and fixture are configured and the concrete adapter
is verified, capture queueing fails closed and `promo-worker` continues to claim
only `noop` jobs.

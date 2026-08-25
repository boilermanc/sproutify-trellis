# Promo Capture Worker foundation

This directory defines the boundary for a future Playwright capture worker. It is intentionally not executable yet and must not claim `capture` jobs until all of the following are configured:

- an active branch source with an HTTPS `capture_base_url`;
- an opaque server-side `capture_fixture_key`;
- an optional opaque `capture_auth_profile_key` when the fixture requires authentication;
- a script-approved immutable Promo Manifest revision;
- pinned repository evidence whose commit matches the capture scenario;
- a verified route and at least one declarative assertion;
- isolated worker storage and a private `promo-assets` upload path.

The browser can submit only a scenario ID. `promo-studio` resolves the authoritative manifest and branch source server-side and writes a secret-free job payload containing scenario/source identifiers and the expected commit. The future worker must resolve credentials from its own secret store, block service workers, enforce masks and PII assertions, upload trace/video/still artifacts, and complete the existing leased job protocol.

Until a capture environment and fixture are configured, capture queueing fails closed. `promo-worker` continues to claim only `noop` jobs.

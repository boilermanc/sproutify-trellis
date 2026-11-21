# Rejoice App Store downloads

Reports → App Store now supports Rejoice (Apple app ID 6754806358) alongside Home and Rekkrd. The app selector and branch filter keep each app's totals, daily downloads, territories, freshness and manual sync separate. Only aggregate reporting is stored in the Trellis Hub; no customer database writes or credential changes are required.

The user approved the database update, commit/push, deployment and daily activation. Switchboard resolves Trellis Hub horvjqqifgrzxesuxtfm; Rejoice's existing app record and report requests are reused. Apply only migration `20261103150125_rejoice_app_store_downloads.sql`, which extends the service-only snapshot allowlist to Rejoice. Run `tests/rejoice-app-store-snapshots.sql` as its rollback-only stale-correction check. Verify anon and authenticated cannot execute the helper.

Deploy the scoped App Store collector using the existing production shared authentication dependency and JWT setting. Default unscoped sync remains Rekkrd; Rejoice must be selected explicitly. Perform a Rejoice-only bootstrap import followed by a repeat incremental sync; compare the matching reporting window to Apple, and confirm Home/Rekkrd are unaffected. Local unit, build, TypeScript and browser checks cover the third app's isolation.

The daily Rejoice workflow uses the existing Trellis refresh header credential and Apple ID 6754806358. Schedule it at 16:35 Etc/UTC, after Rekkrd16:15 and Home16:25. The inactive credential-free blueprint is `B10-rejoice-app-store-daily-sync.json`; activate only after successful live verification. Failed imports return non-success HTTP status and must fail workflow execution.

Recovery: deactivate only Rejoice's workflow, restore the prior collector/frontend if needed, and retain all reporting data. The former Home/Rekkrd allowlist can be restored only after Rejoice imports are stopped. The prior deployed function source is preserved outside Git at `C:/Users/clint/AppData/Local/Temp/trellis-rejoice-appstore-backup-20261103`. Never drop report tables as a rollback.

## Release verification — November 3, 2026

The Rejoice allowlist migration was applied to the Switchboard-selected Trellis Hub. The rollback-only Rejoice correction test passed. Collector code was deployed from an isolated directory with the prior production shared authentication dependency; no credentials changed. Rejoice workflow `ab1hr8UDYs7gmyA1` was created separately using the existing Trellis refresh credential and explicit Apple app ID 6754806358. Its observed execution timezone is Etc/UTC. Publication is gated on a successful Rejoice-only import and verified16:35 daily schedule. Twelve unit tests cover category handling and app partitioning; the existing apps remain scoped to their own daily workflows.

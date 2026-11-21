# Sproutify Home App Store downloads

Extends the existing Reports → App Store panel to Sproutify Home (Apple app ID 6478242429) alongside Rekkrd (6795955100). Select an app when viewing all branches; selecting the Home branch selects its app. Each app's totals, daily rows, territory counts and manual sync remain separate.

The existing Home app connection, branch mapping and Apple report requests were verified read-only on November 3, 2026. The shared Apple server credentials already exist; no credential changes are needed. Home's old generic snapshots must be reimported into canonical download categories before the new dashboard can show totals. This is aggregate reporting in the Trellis Hub, not access to or writes into Home's customer database.

Prepared release scope:

- Apply only `20261103143958_home_app_store_downloads.sql` to the Switchboard-selected Trellis Hub. It extends the service-only storage helper's allowlist to Home and Rekkrd; unrelated apps remain excluded. Retain the previous function definition for recovery. No tables or historical reports are deleted.
- Deploy only the updated App Store collector and the scoped frontend changes, preserving the deployed shared auth dependency and existing JWT setting. An unscoped scheduled request still defaults to Rekkrd; Home must be explicitly selected by its Apple ID or connection ID.
- Run a Home-only initial import and compare the same reporting dates to App Store Connect. Repeat to check unchanged totals and incremental refresh. Run `tests/home-app-store-snapshots.sql` within its rollback transaction, then confirm Rekkrd remains unchanged.
- Import `B9-home-app-store-daily-sync.json` inactive, select the existing Trellis refresh header credential, and execute manually. Activate only after explicit release authorization and a successful live check. Planned daily time is 16:25 UTC, ten minutes after Rekkrd's existing 16:15 UTC schedule.

Recovery: deactivate only Home's workflow, restore the prior collector/frontend if necessary, and retain report history. The prior storage helper can be restored to its Rekkrd-only definition after disabling Home imports. No credential rotation or destructive rollback is required.

Local verification uses Node aggregation/partition tests, TypeScript, the production build, and desktop/mobile browser fixtures with both apps. These checks are separate from applying SQL, deploying, importing live data or activating the workflow. See APP_STORE_ANALYTICS.md for Apple API documentation, correction handling and incremental processing details.

## Home release — November 3, 2026

The user explicitly approved Home's database update, commit/push, deployment and 16:25 UTC daily schedule. The storage helper was applied through Switchboard to Hub horvjqqifgrzxesuxtfm; the Home rollback-only stale-snapshot test passed. The collector was deployed from an isolated folder using the existing production auth dependency and JWT setting. Recovery source is preserved at `C:/Users/clint/AppData/Local/Temp/trellis-home-appstore-backup-20261103`.

Home's workflow is `CobA9VY4qNrhV2PX`, created separately from Rekkrd's existing workflow, and reuses the Trellis PostHog Refresh credential. Its request explicitly selects Apple app 6478242429. Publication remains gated on a successful Home-only import and verified UTC 16:25 schedule. Local release checks passed: production build, TypeScript, eleven unit tests, and desktop/mobile browser coverage for app isolation, branch selection, scoped manual sync and stale-response handling. Live counts and deployment are verified separately after publication.

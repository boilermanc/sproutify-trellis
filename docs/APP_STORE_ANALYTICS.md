# Rekkrd App Store downloads

Open **Reports → App Store** with Rekkrd selected (or all branches). This integration is limited to Rekkrd, Apple app ID **6795955100**. App ID 6795355979 belongs to Once Upon a Drawing and must not be used for Rekkrd.

The panel separates first-time downloads from redownloads, shows daily trends and territory totals, and identifies the latest imported date and last successful sync. Apple updates and restores are separate categories; they do not count toward new downloads. These are aggregate store reports, not identities, signups, active users, or campaign attribution. Missing coverage is not evidence of zero downloads. Recent data can change as Apple processes corrections.

## Data and access

The existing `app_store_apps` and `app_store_metric_snapshots` tables and the Rekkrd report request IDs may already be provisioned. Check the routed Trellis project before creating or changing anything. Existing server-side `ASC_ISSUER_ID`, `ASC_KEY_ID`, and `ASC_PRIVATE_KEY` may also already be configured; verify presence without displaying their values. Never put the private `.p8` key or other credentials in repository files, the browser bundle, chat, or workflow JSON.

The collector reads Apple's Standard downloads report and stores one aggregate metrics object per app/report/event date. It keeps download types and territory totals, not individual report rows. All report segments must finish before a date is saved. Newer processing dates replace earlier values rather than adding duplicate counts; the storage function protects against an older concurrent run overwriting a newer correction.

An initial ongoing analytics report request requires Apple Admin access. An existing report can be downloaded with a Sales and Reports API key. Initial generation normally takes 24–48 hours. A browser login alone does not supply credentials to the scheduled server-side collector.

## Release preparation

The target is the Trellis Hub (`horvjqqifgrzxesuxtfm`), not Rekkrd's customer database. Resolve it with the installed Supabase Switchboard before any CLI or MCP operation. Database writes, deployments, credential changes, and schedule activation require explicit authorization under the repository working agreements.

Before an authorized release:

1. Confirm existing app tables, Rekkrd branch mapping, report request IDs, and server-side credential presence. Do not rerun the historical multi-app seed just to connect Rekkrd.
2. Review and apply `supabase/migrations/20261103135704_rekkrd_download_snapshot_storage.sql` to install the service-role-only conditional snapshot storage function. Retain existing metric data and a copy of the current deployed Edge Function for recovery.
3. Deploy the updated `app-store-analytics` Edge Function and frontend through the approved release workflow. This guide does not imply deployment has occurred.
4. Run one scoped sync for Apple app ID 6795955100. Compare the same event dates and download categories with App Store Connect; verify country totals and repeat the sync to check idempotency. Confirm other apps are unaffected.
5. Import `n8n-blueprints/B8-app-store-daily-sync.json` inactive. Select the existing HTTP Header Auth credential using header `x-trellis-refresh-secret` and the server-side `POSTHOG_REFRESH_SECRET` value. Execute manually, verify the validation node succeeds, then activate only after authorization.

The workflow timezone is explicitly UTC and runs daily at 16:15 UTC. Its final node treats per-app failures as execution failures, including errors returned with HTTP 207. Pending Apple reports are a waiting state; inspect the panel and report availability rather than repeatedly creating requests or rotating credentials.

For recovery, deactivate the schedule first, retain existing snapshots, and restore the prior deployed function/frontend if needed. The new SQL function is additive and may remain unused during rollback. Do not delete report history or disable RLS. Re-run a successful corrected import to replace incorrect daily aggregates after fixing the cause.

## Verification

Local checks: `node --test tests/app-store-downloads.test.mjs`, `npx tsc --noEmit`, and `npm run build`, plus the dashboard fixture/browser checks supplied with the change. Validate the workflow JSON parses and its request targets Rekkrd. Local fixture checks do not verify Apple credentials, deployed functions, production data, or an active schedule; record those separately after release.

## Apple references

- [Download reporting fields](https://developer.apple.com/documentation/analytics-reports/app-download)
- [Downloading analytics reports and roles](https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports)
- [Data completeness and corrections](https://developer.apple.com/documentation/analytics-reports/data-completeness-corrections)
- [Reports API overview and initial availability](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api)

## Release verification — November 3, 2026

The Switchboard route works with the existing saved Windows credential when run with the required local access; no token was changed. The service-only snapshot helper was installed on the Trellis Hub and its access checks passed. `tests/app-store-snapshots.sql` passed in a rollback transaction, proving older processing dates cannot overwrite newer values.

The collector was deployed with its existing JWT setting and active-operator / scheduled-secret checks preserved. A scoped live Rekkrd import succeeded with eight saved reporting dates. Apple supplied `First-time download` in live files; category matching now ignores capitalization, covered by a regression test. Failed imports return HTTP 502 so the existing daily workflow cannot mark a failed import successful. Older generic Counts-only snapshots remain unavailable in the new UI until corrected reports replace them.

The production workflow is the existing `5mciXfuldFBlnCStXjHdU` at n8n.sproutify.app, not a duplicate. It reuses the existing Trellis refresh credential and sends Apple app ID 6795955100. The reviewed schedule is 16:15 in Etc/UTC. Frontend release confirmation and workflow publication are recorded after their final live checks.

The isolated frontend is based on the latest remote main, with only this feature's files copied. The unrelated local SignalScout import filename was corrected so the working checkout builds; it is excluded from the release because remote main does not need that fix. Recovery sources are preserved outside the repository at `C:/Users/clint/AppData/Local/Temp/trellis-rekkrd-release-20261103`.

Repeat-sync verification found that rereading the complete history could exceed a browser request's lifetime. The collector now bootstraps up to 95 processing days only until canonical download data exists, then uses the last successful sync with a three-day overlap. New processing dates still carry corrections to older event dates. Legacy generic snapshots cannot activate the incremental watermark. A successful empty refresh retains active status and advances the successful-check timestamp. Regression tests cover this distinction.

Frontend deployment run 41651092179 succeeded; the public build marker matched 81e07b9e559a74d2a4ed249388e10c22ae7e8b77. The authenticated production panel showed 5 first-time downloads, 0 redownloads and 2 updates in the 30-day window. Apple App Store Connect's matching Oct 4–Nov 1 available range independently showed the same 5 first-time downloads on Oct 18, 19, 22, 23 and 26. The existing daily workflow was published with the Rekkrd scope and verified Etc/UTC timezone at 16:15.

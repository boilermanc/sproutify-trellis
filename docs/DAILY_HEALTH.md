# Daily health and the GitHub repair queue

The dashboard and the **Daily Trellis Health** GitHub Actions workflow use the same authenticated `system-health` Edge Function on the Trellis Hub (`horvjqqifgrzxesuxtfm`). The schedule is daily at **12:17 UTC** (8:17 AM Eastern daylight time; 7:17 AM Eastern standard time). GitHub may start scheduled workflows a little late. `workflow_dispatch` runs an immediate check.

The bot creates one issue per actionable component under the `trellis-health` label. Open an issue in Codex to investigate and implement a fix, then rerun the workflow. The issue contains scrubbed evidence, its observation time, a workflow-run link, and a bounded repair suggestion. It updates on status changes, reopens when a failure returns, and closes only after a complete report explicitly confirms recovery. Unchanged problems produce no new issues or comments; each run logs the latest aggregate diagnostics. Human-authored issues are never changed. Removed components require a human decision rather than automatic closure.

## What is measured

- **Webhook registration:** read-only GET checks. n8n returns a special 404 message for a registered POST-only webhook, which counts as registered. A generic proxy 404 is an error, not evidence that the workflow is inactive. 401/403/429/5xx are errors. Registration does not prove that downstream rendering, publishing, or sending succeeds.
- **Spoke access:** read-only HEAD requests to every enabled configured table, with the stored credential resolved server-side. No profile rows are returned or saved. Disconnected spokes are excluded. Missing configuration and failed inventory queries are unknown. Successful access does not establish record freshness, completeness, or that RLS exposes the expected rows.
- **Email quality:** three exact database counts of `sent`, `bounced`, and `complained` events over a fixed rolling seven-day interval. This avoids the Data API row limit. Counts cover all recorded events in the shared Resend account. Complaints or a bounce rate above 5% prompt review, not a provider-outage label. This threshold is an operational alert rule, not an automatic send/pause decision.
- **Optional integrations:** missing optional webhook paths remain visible as OPTIONAL but are excluded from the attention count and issue creation. The allowlist is in `supabase/functions/_shared/system-health.mjs`.

The other dashboard email widgets paginate their event data fully, with a fixed upper timestamp and deterministic ordering. A failed page discards the incomplete result.

## Automatic recovery boundaries

Temporary transport failures, rate limits, and server errors receive one additional read-only check after a short delay. A recovered check clears the current alert, and a complete daily report closes its bot issue. The bot cannot run arbitrary repair commands, activate workflows, restart services, change credentials or permissions, modify spoke data, replay email/social actions, or deploy code. Those actions remain reviewed repairs in Codex. Endpoint/authentication/report failures create a monitor issue and fail the Actions run; incomplete checks cannot close earlier issues.

## Configuration and permissions

- Supabase secret: `TRELLIS_HEALTH_TOKEN`, a dedicated random credential for this fixed read-only endpoint.
- GitHub Actions secret: `TRELLIS_HEALTH_TOKEN`, the same value.
- The workflow reuses `VITE_SUPABASE_ANON_KEY` for the Supabase gateway and the short-lived `GITHUB_TOKEN` with only `contents: read` and `issues: write`.
- Deploy both `system-health` and the updated legacy `webhook-health` with JWT verification enabled. The new function additionally requires an active Trellis user or the dedicated health token. The bot never gets a Supabase service-role key or a spoke key.
- To rotate, replace the dedicated token in both locations, then dispatch the workflow. Do not place it in source, an issue, or a frontend environment variable.
- Scheduling is active only after `.github/workflows/daily-health.yml` is on the repository's default branch. Confirm an actual successful manual run before considering installation complete.

## Verification

Run `node --test tests/system-health.test.mjs tests/daily-health.test.mjs`, `deno check supabase/functions/system-health/index.ts supabase/functions/webhook-health/index.ts`, the frontend TypeScript check, and the production build. Compare the live endpoint's exact email window to a read-only SQL count. Dispatch the workflow twice: the first should create current findings; the second should create no duplicates. Check that the UI uses the same counts and distinguishes DOWN, ERROR, REVIEW, UNKNOWN, and OPTIONAL.

Regression lesson: increasing a client range does not override Supabase's server row cap. Use exact counts for totals, complete pagination for records, and report missing observations explicitly. A connection-test timestamp must never be presented as a data-sync timestamp.

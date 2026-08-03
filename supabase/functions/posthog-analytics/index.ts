import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ORG_ID,
  adminClient,
  cors,
  decryptSecret,
  isPosthogRefreshRequest,
  json,
  requireTrellisUser,
  rowObject,
  runPosthogQuery,
} from "../_shared/posthog.ts";

const CACHE_MS = 60 * 60 * 1000;
const WINDOWS = new Set([7, 30, 90]);
const SIGNUP_EVENTS = ["user_signed_up", "account_created"];
const ONBOARDING_EVENTS = ["onboarding_completed"];
const ACTIVATION_EVENTS = ["activation_milestone_reached"];

const n = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const pct = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
const sqlList = (values: string[]): string => values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!isPosthogRefreshRequest(req)) {
    const operator = await requireTrellisUser(req);
    if (operator instanceof Response) return operator;
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const connectionId = String(body.connection_id || "");
  const windowDays = Number(body.window_days || 30);
  const force = body.force === true;
  if (!WINDOWS.has(windowDays)) return json({ error: "window_days must be 7, 30, or 90" }, 400);

  const db = adminClient();
  const { data: connection } = await db
    .from("posthog_connections")
    .select("*,branches(name,slug)")
    .eq("id", connectionId)
    .eq("organization_id", ORG_ID)
    .maybeSingle();
  if (!connection) return json({ error: "Connection not found" }, 404);

  const { data: latest } = await db
    .from("posthog_metric_snapshots")
    .select("result,fetched_at")
    .eq("connection_id", connectionId)
    .eq("metric_key", "product_analytics_summary")
    .eq("window_days", windowDays)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!force && latest && Date.now() - new Date(latest.fetched_at).getTime() < CACHE_MS) {
    return json({
      connection_id: connectionId,
      branch_id: connection.branch_id,
      branch_name: connection.branches?.name || connection.branches?.slug,
      data: latest.result,
      fetched_at: latest.fetched_at,
      cached: true,
      stale: false,
    });
  }

  try {
    const apiKey = await decryptSecret(connection.api_key_ciphertext);
    const allAllowedEvents = Array.isArray(connection.allowed_events) ? connection.allowed_events.map(String) : [];
    const milestoneEvents = allAllowedEvents.filter((event: string) =>
      !SIGNUP_EVENTS.includes(event) && !ONBOARDING_EVENTS.includes(event) && !ACTIVATION_EVENTS.includes(event)
    );

    const activityQuery = `
      SELECT
        uniqIf(distinct_id, timestamp >= now() - INTERVAL 1 DAY) AS dau,
        uniqIf(distinct_id, timestamp >= now() - INTERVAL 7 DAY) AS wau,
        uniqIf(distinct_id, timestamp >= now() - INTERVAL 30 DAY) AS mau,
        uniqIf(properties.$session_id, timestamp >= now() - INTERVAL ${windowDays} DAY AND properties.$session_id IS NOT NULL) AS sessions,
        uniqIf(distinct_id, timestamp >= now() - INTERVAL ${windowDays} DAY) AS unique_users,
        uniqIf(distinct_id, timestamp >= now() - INTERVAL ${windowDays} DAY AND event IN (${sqlList(SIGNUP_EVENTS)})) AS new_users
      FROM events
      WHERE timestamp >= now() - INTERVAL ${Math.max(30, windowDays)} DAY
    `;
    const funnelQuery = `
      SELECT
        uniqIf(distinct_id, event IN (${sqlList(SIGNUP_EVENTS)})) AS signed_up,
        uniqIf(distinct_id, event IN (${sqlList(ONBOARDING_EVENTS)})) AS onboarded,
        uniqIf(distinct_id, event IN (${sqlList(ACTIVATION_EVENTS)})) AS activated
      FROM events
      WHERE timestamp >= now() - INTERVAL ${windowDays} DAY
    `;
    const retentionQuery = `
      SELECT
        countIf(active_previous_7 > 0) AS cohort_7,
        countIf(active_previous_7 > 0 AND active_current_7 > 0) AS retained_7,
        countIf(active_previous_30 > 0) AS cohort_30,
        countIf(active_previous_30 > 0 AND active_current_30 > 0) AS retained_30
      FROM (
        SELECT
          distinct_id,
          countIf(timestamp >= now() - INTERVAL 7 DAY) AS active_current_7,
          countIf(timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS active_previous_7,
          countIf(timestamp >= now() - INTERVAL 30 DAY) AS active_current_30,
          countIf(timestamp >= now() - INTERVAL 60 DAY AND timestamp < now() - INTERVAL 30 DAY) AS active_previous_30
        FROM events
        WHERE timestamp >= now() - INTERVAL 60 DAY
        GROUP BY distinct_id
      )
    `;

    const [activityResult, funnelResult, retentionResult] = await Promise.all([
      runPosthogQuery(connection.host_url, connection.project_id, apiKey, activityQuery, "Trellis active users and sessions"),
      runPosthogQuery(connection.host_url, connection.project_id, apiKey, funnelQuery, "Trellis lifecycle funnel"),
      runPosthogQuery(connection.host_url, connection.project_id, apiKey, retentionQuery, "Trellis period retention"),
    ]);

    const activity = rowObject(activityResult);
    const funnel = rowObject(funnelResult);
    const retention = rowObject(retentionResult);
    let adoption: Array<{ event: string; users: number; events: number }> = [];
    if (milestoneEvents.length) {
      const adoptionResult = await runPosthogQuery(
        connection.host_url,
        connection.project_id,
        apiKey,
        `SELECT event, uniq(distinct_id) AS users, count() AS events
         FROM events
         WHERE timestamp >= now() - INTERVAL ${windowDays} DAY AND event IN (${sqlList(milestoneEvents)})
         GROUP BY event ORDER BY users DESC LIMIT 20`,
        "Trellis feature milestone adoption",
      );
      adoption = adoptionResult.results.map((row) => ({ event: String(row[0]), users: n(row[1]), events: n(row[2]) }));
    }

    const signedUp = n(funnel.signed_up);
    const onboarded = n(funnel.onboarded);
    const activated = n(funnel.activated);
    const uniqueUsers = n(activity.unique_users);
    const newUsers = n(activity.new_users);
    const cohort7 = n(retention.cohort_7);
    const retained7 = n(retention.retained_7);
    const cohort30 = n(retention.cohort_30);
    const retained30 = n(retention.retained_30);

    const summary = {
      window_days: windowDays,
      active_users: { daily: n(activity.dau), weekly: n(activity.wau), monthly: n(activity.mau) },
      sessions: n(activity.sessions),
      users: { total_in_window: uniqueUsers, new: newUsers, returning: Math.max(0, uniqueUsers - newUsers) },
      lifecycle_funnel: {
        signed_up: signedUp,
        onboarded,
        activated,
        signup_to_onboarding_pct: pct(onboarded, signedUp),
        onboarding_to_activation_pct: pct(activated, onboarded),
      },
      retention: {
        day_7_pct: pct(retained7, cohort7),
        day_30_pct: pct(retained30, cohort30),
        cohort_7: cohort7,
        retained_7: retained7,
        cohort_30: cohort30,
        retained_30: retained30,
      },
      feature_adoption: adoption,
    };
    const fetchedAt = new Date().toISOString();

    const { error: snapshotError } = await db.from("posthog_metric_snapshots").insert({
      connection_id: connectionId,
      branch_id: connection.branch_id,
      metric_key: "product_analytics_summary",
      window_days: windowDays,
      result: summary,
      source: "posthog",
      fetched_at: fetchedAt,
    });
    if (snapshotError) throw new Error(`Could not cache PostHog metrics: ${snapshotError.message}`);

    await db.from("posthog_connections").update({
      status: "active",
      last_successful_query_at: fetchedAt,
      last_error: null,
      updated_at: fetchedAt,
    }).eq("id", connectionId);
    await db.rpc("prune_posthog_metric_snapshots");

    return json({
      connection_id: connectionId,
      branch_id: connection.branch_id,
      branch_name: connection.branches?.name || connection.branches?.slug,
      data: summary,
      fetched_at: fetchedAt,
      cached: false,
      stale: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostHog analytics query failed";
    await db.from("posthog_connections").update({ status: "error", last_error: message, updated_at: new Date().toISOString() }).eq("id", connectionId);
    if (latest) {
      return json({
        connection_id: connectionId,
        branch_id: connection.branch_id,
        branch_name: connection.branches?.name || connection.branches?.slug,
        data: latest.result,
        fetched_at: latest.fetched_at,
        cached: true,
        stale: true,
        warning: message,
      });
    }
    return json({ error: message }, 502);
  }
});

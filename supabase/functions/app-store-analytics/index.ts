import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  REPORT_ALLOWLIST,
  adminClient,
  aggregateRows,
  appleJson,
  applePages,
  appleToken,
  cors,
  json,
  parseTsv,
  requireTrellisUser,
  isRefreshRequest,
} from "../_shared/app-store.ts";

const WINDOWS = new Set([7, 30, 90]);

async function downloadSegment(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Apple report download returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return "";
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function syncApp(app: any, token: string): Promise<{ imported: number; reports: number }> {
  const db = adminClient();
  let imported = 0;
  let reportCount = 0;
  const requestIds = [app.snapshot_request_id, app.ongoing_request_id].filter(Boolean);

  for (const requestId of requestIds) {
    const reports = await applePages(`/analyticsReportRequests/${requestId}/reports?limit=200`, token);
    for (const report of reports) {
      const name = String(report?.attributes?.name || "");
      const category = String(report?.attributes?.category || "");
      if (!REPORT_ALLOWLIST.has(name) || !["APP_USAGE", "APP_STORE_ENGAGEMENT", "COMMERCE", "PERFORMANCE"].includes(category)) continue;
      reportCount++;
      const instances = await applePages(`/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`, token);
      instances.sort((left, right) => String(right?.attributes?.processingDate || "").localeCompare(String(left?.attributes?.processingDate || "")));
      for (const instance of instances.slice(0, 95)) {
        const processingDate = String(instance?.attributes?.processingDate || new Date().toISOString()).slice(0, 10);
        const segments = await applePages(`/analyticsReportInstances/${instance.id}/segments?limit=200`, token);
        const aggregate = new Map<string, Record<string, number>>();
        for (const segment of segments) {
          const url = segment?.attributes?.url;
          if (!url) continue;
          const segmentRows = aggregateRows(parseTsv(await downloadSegment(url)), processingDate);
          for (const [date, metrics] of segmentRows) {
            const combined = aggregate.get(date) || {};
            for (const [key, value] of Object.entries(metrics)) combined[key] = (combined[key] || 0) + value;
            aggregate.set(date, combined);
          }
        }
        const records = [...aggregate.entries()].filter(([, metrics]) => Object.keys(metrics).length).map(([metricDate, metrics]) => ({
          app_id: app.id,
          branch_id: app.branch_id,
          metric_date: metricDate,
          report_name: name,
          category,
          granularity: "DAILY",
          metrics,
          source_processing_date: processingDate,
          source_instance_id: String(instance.id),
          fetched_at: new Date().toISOString(),
        }));
        if (records.length) {
          const { error } = await db.from("app_store_metric_snapshots").upsert(records, {
            onConflict: "app_id,report_name,granularity,metric_date",
          });
          if (error) throw new Error(`Could not store Apple aggregates: ${error.message}`);
          imported += records.length;
        }
      }
    }
  }
  return { imported, reports: reportCount };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const op = String(body.op || "status");
  if (!isRefreshRequest(req)) {
    const operator = await requireTrellisUser(req, op === "sync" ? ["owner", "admin"] : undefined);
    if (operator instanceof Response) return operator;
  }
  const db = adminClient();

  if (op === "status") {
    const windowDays = Number(body.window_days || 30);
    if (!WINDOWS.has(windowDays)) return json({ error: "window_days must be 7, 30, or 90" }, 400);
    const branchIds = Array.isArray(body.branch_ids) ? body.branch_ids.map(String).filter(Boolean) : [];
    let appsQuery = db.from("app_store_apps").select("*,branches(name,slug)").neq("status", "disconnected").order("name");
    if (branchIds.length) appsQuery = appsQuery.in("branch_id", branchIds);
    const { data: apps, error: appsError } = await appsQuery;
    if (appsError) return json({ error: appsError.message }, 500);
    const appIds = (apps || []).map((app: any) => app.id);
    let snapshots: any[] = [];
    if (appIds.length) {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
      const { data, error } = await db.from("app_store_metric_snapshots")
        .select("app_id,branch_id,metric_date,report_name,category,metrics,fetched_at")
        .in("app_id", appIds).gte("metric_date", since).order("metric_date");
      if (error) return json({ error: error.message }, 500);
      snapshots = data || [];
    }
    return json({ apps: apps || [], snapshots, window_days: windowDays });
  }

  if (op !== "sync") return json({ error: "Unsupported operation" }, 400);
  let query = db.from("app_store_apps").select("*").neq("status", "disconnected").order("name");
  if (body.app_id) query = query.eq("id", String(body.app_id));
  const { data: apps, error: appsError } = await query;
  if (appsError) return json({ error: appsError.message }, 500);
  const token = await appleToken();
  const results = [];
  for (const app of apps || []) {
    try {
      const result = await syncApp(app, token);
      const syncedAt = new Date().toISOString();
      await db.from("app_store_apps").update({ status: "active", last_synced_at: syncedAt, last_error: null, updated_at: syncedAt }).eq("id", app.id);
      results.push({ app_id: app.id, name: app.name, ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apple analytics sync failed";
      await db.from("app_store_apps").update({ status: "error", last_error: message, updated_at: new Date().toISOString() }).eq("id", app.id);
      results.push({ app_id: app.id, name: app.name, ok: false, error: message });
    }
  }
  await db.rpc("prune_app_store_metric_snapshots");
  return json({ results, synced_at: new Date().toISOString() }, results.some((result) => !result.ok) ? 207 : 200);
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  applePages,
  appleToken,
  cors,
  isRefreshRequest,
  json,
  requireTrellisUser,
} from "../_shared/app-store.ts";
import {
  aggregateDownloads,
  DOWNLOAD_REPORT,
  isDownloadReport,
  parseDownloadTsv,
  processingWindowStart,
  REKKRD_APPLE_ID,
  SUPPORTED_APPLE_IDS,
  selectLatestDownloadDates,
} from "../_shared/app-store-downloads.mjs";
import { ORG_ID } from "../_shared/posthog.ts";

const WINDOWS = new Set([7, 30, 90]);

async function downloadSegment(url: string): Promise<string> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" || target.username || target.password ||
    target.port
  ) throw new Error("Invalid Apple report download URL.");
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`Apple report download returned HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return "";
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Response(stream).text();
}

async function syncApp(
  app: any,
  token: string,
): Promise<{ imported: number; reports: number }> {
  const db = adminClient();
  let imported = 0;
  let reportCount = 0;
  const requestIds = [app.snapshot_request_id, app.ongoing_request_id].filter(
    Boolean,
  );
  const completed: any[] = [];
  const { data: existing, error: existingError } = await db.from("app_store_metric_snapshots")
    .select("metrics").eq("app_id", app.id).eq("report_name", DOWNLOAD_REPORT).limit(100);
  if (existingError) throw new Error("Could not load Apple import watermark.");
  const processingSince = processingWindowStart(app.last_synced_at,
    (existing || []).some((row: any) => typeof row.metrics?.["First-Time Downloads"] === "number"));

  for (const requestId of requestIds) {
    const reports = await applePages(
      `/analyticsReportRequests/${requestId}/reports?limit=200`,
      token,
    );
    for (const report of reports) {
      const name = String(report?.attributes?.name || "");
      if (!isDownloadReport(name)) continue;
      reportCount++;
      const instances = await applePages(
        `/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`,
        token,
      );
      instances.sort((left, right) =>
        String(right?.attributes?.processingDate || "").localeCompare(
          String(left?.attributes?.processingDate || ""),
        )
      );
      for (const instance of instances) {
        const processingDate = String(
          instance?.attributes?.processingDate || "",
        );
        if (!/^\d{4}-\d{2}-\d{2}$/.test(processingDate)) {
          throw new Error("Apple report is missing its processing date.");
        }
        if (processingDate < processingSince) continue;
        const segments = await applePages(
          `/analyticsReportInstances/${instance.id}/segments?limit=200`,
          token,
        );
        const rows: Record<string, string>[] = [];
        if (!segments.length) {
          throw new Error("Apple download report has no segments yet.");
        }
        for (const segment of segments) {
          const url = segment?.attributes?.url;
          if (!url) {
            throw new Error(
              "Apple download report segment has no download URL.",
            );
          }
          rows.push(...parseDownloadTsv(await downloadSegment(url)));
        }
        completed.push({
          processingDate,
          instanceId: String(instance.id),
          dates: aggregateDownloads(rows, app.apple_app_id),
        });
      }
    }
  }
  const records = [...selectLatestDownloadDates(completed).entries()].map((
    [metricDate, entry]: [string, any],
  ) => ({
    app_id: app.id,
    branch_id: app.branch_id,
    metric_date: metricDate,
    report_name: DOWNLOAD_REPORT,
    category: "COMMERCE",
    granularity: "DAILY",
    metrics: entry.metrics,
    source_processing_date: entry.processingDate,
    source_instance_id: entry.instanceId,
    fetched_at: new Date().toISOString(),
  }));
  if (records.length) {
    const { data, error } = await db.rpc("store_app_store_download_snapshots", {
      records,
    });
    if (error) {
      throw new Error(
        "Could not store Apple download aggregates. Verify the download snapshot SQL has been installed.",
      );
    }
    imported += Number(data || 0);
  }
  return { imported, reports: reportCount };
}

export async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "JSON object required" }, 400);
  }
  const op = String(body.op || "status");
  if (body.apple_app_id && !SUPPORTED_APPLE_IDS.includes(body.apple_app_id)) {
    return json(
      { error: "Only Rekkrd and Sproutify Home App Store downloads are supported." },
      400,
    );
  }
  if (isRefreshRequest(req) && op !== "sync") {
    return json({ error: "Scheduled workers may only sync downloads." }, 403);
  }
  if (!isRefreshRequest(req)) {
    const operator = await requireTrellisUser(
      req,
      op === "sync" ? ["owner", "admin"] : undefined,
    );
    if (operator instanceof Response) return operator;
  }
  const db = adminClient();

  if (op === "status") {
    const windowDays = Number(body.window_days || 30);
    if (!WINDOWS.has(windowDays)) {
      return json({ error: "window_days must be 7, 30, or 90" }, 400);
    }
    const branchIds = Array.isArray(body.branch_ids)
      ? body.branch_ids.map(String).filter(Boolean)
      : [];
    let appsQuery = db.from("app_store_apps").select("*,branches(name,slug)")
      .eq("organization_id", ORG_ID).in("apple_app_id", SUPPORTED_APPLE_IDS).neq(
        "status",
        "disconnected",
      ).order("name");
    if (branchIds.length) appsQuery = appsQuery.in("branch_id", branchIds);
    const { data: apps, error: appsError } = await appsQuery;
    if (appsError) {
      return json(
        { error: "Could not load App Store connection." },
        500,
      );
    }
    const appIds = (apps || []).map((app: any) => app.id);
    let snapshots: any[] = [];
    if (appIds.length) {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString()
        .slice(0, 10);
      const { data, error } = await db.from("app_store_metric_snapshots")
        .select(
          "app_id,branch_id,metric_date,report_name,category,metrics,fetched_at",
        )
        .in("app_id", appIds).eq("report_name", DOWNLOAD_REPORT).gte(
          "metric_date",
          since,
        ).lt("metric_date", new Date().toISOString().slice(0, 10)).order(
          "metric_date",
        );
      if (error) {
        return json({ error: "Could not load App Store download counts." }, 500);
      }
      snapshots = data || [];
    }
    return json({ apps: apps || [], snapshots, window_days: windowDays });
  }

  if (op !== "sync") return json({ error: "Unsupported operation" }, 400);
  let query = db.from("app_store_apps").select("*").eq(
    "organization_id",
    ORG_ID,
  ).in("apple_app_id", SUPPORTED_APPLE_IDS).neq("status", "disconnected").order(
    "name",
  );
  if (body.app_id && !/^[0-9a-f-]{36}$/i.test(String(body.app_id))) {
    return json({ error: "Invalid app connection ID." }, 400);
  }
  if (body.app_id) query = query.eq("id", String(body.app_id));
  if (body.apple_app_id) query = query.eq("apple_app_id", body.apple_app_id);
  if (!body.app_id && !body.apple_app_id) query = query.eq("apple_app_id", REKKRD_APPLE_ID);
  const { data: apps, error: appsError } = await query;
  if (appsError) {
    return json({ error: "Could not load App Store connection." }, 500);
  }
  if (!apps?.length) {
    return json({
      error: "No matching supported App Store connection is configured.",
    }, 404);
  }
  let token: string;
  try {
    token = await appleToken();
  } catch {
    return json({
      error:
        "App Store Connect credentials are not configured correctly on the server.",
    }, 503);
  }
  const results = [];
  for (const app of apps || []) {
    try {
      const result = await syncApp(app, token);
      const syncedAt = new Date().toISOString();
      const { error: statusError } = await db.from("app_store_apps").update({
        status: result.imported || app.last_synced_at ? "active" : "pending",
        last_synced_at: result.reports ? syncedAt : app.last_synced_at,
        last_error: null,
        updated_at: syncedAt,
      }).eq("id", app.id);
      if (statusError) throw new Error("Could not update Apple import status.");
      results.push({ app_id: app.id, name: app.name, ok: true, ...result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const message = /^(Apple download report|Invalid Apple report|Unknown Apple download|Invalid Apple download|Apple report pagination|Could not store Apple)/.test(detail)
        ? detail.slice(0, 240)
        : "Apple download import failed. Check server credentials, report availability and the download snapshot SQL.";
      await db.from("app_store_apps").update({
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", app.id);
      results.push({
        app_id: app.id,
        name: app.name,
        ok: false,
        error: message,
      });
    }
  }
  return json(
    { results, synced_at: new Date().toISOString() },
    results.some((result) => !result.ok) ? 502 : 200,
  );
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch {
    return json({
      error: "App Store analytics request failed. Try again shortly.",
    }, 500);
  }
});

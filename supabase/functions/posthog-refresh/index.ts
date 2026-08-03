import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HUB_URL, SERVICE_KEY, adminClient, cors, isPosthogRefreshRequest, json } from "../_shared/posthog.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isPosthogRefreshRequest(req)) return json({ error: "Invalid refresh secret" }, 401);

  const db = adminClient();
  const { data: connections, error } = await db
    .from("posthog_connections")
    .select("id")
    .neq("status", "disconnected");
  if (error) return json({ error: "Could not load PostHog connections" }, 500);

  const secret = Deno.env.get("POSTHOG_REFRESH_SECRET")!;
  const windows = [7, 30, 90];
  const jobs = (connections || []).flatMap((connection) => windows.map((windowDays) => ({
    connectionId: connection.id,
    windowDays,
  })));
  const results: Array<{ connection_id: string; window_days: number; ok: boolean; status: number }> = [];

  for (let index = 0; index < jobs.length; index += 5) {
    const batch = jobs.slice(index, index + 5);
    const settled = await Promise.all(batch.map(async (job) => {
      const response = await fetch(`${HUB_URL}/functions/v1/posthog-analytics`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "x-trellis-refresh-secret": secret,
        },
        body: JSON.stringify({ connection_id: job.connectionId, window_days: job.windowDays, force: true }),
      });
      return { connection_id: job.connectionId, window_days: job.windowDays, ok: response.ok, status: response.status };
    }));
    results.push(...settled);
  }

  const failures = results.filter((result) => !result.ok);
  return json({
    connections: connections?.length || 0,
    snapshots_requested: results.length,
    failures,
  }, failures.length ? 207 : 200);
});

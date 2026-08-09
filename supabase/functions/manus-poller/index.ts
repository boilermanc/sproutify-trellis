// Trellis: Manus deep-dive poller
//
// Cron-invoked worker (via run_manus_poller_tick + pg_cron) that advances
// lead_research rows from 'running' to 'complete'/'failed' by polling the Manus
// API. Deploy WITHOUT jwt verification (invoked by pg_cron, like campaign-sender):
//   supabase functions deploy manus-poller --no-verify-jwt
//
// For each in-flight row it checks task.detail; once the task is no longer
// in-progress it pulls task.listMessages, extracts the final markdown + any file
// attachments, and stores them. The raw responses are kept in `raw` for the first
// live runs so the extractor can be tuned to Manus's exact response shape.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MANUS_BASE = "https://api.manus.ai";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

const IN_PROGRESS = new Set([
  "running", "pending", "queued", "working", "in_progress", "processing", "started", "created", "waiting",
]);
const MAX_ROWS = 20;          // rows advanced per tick
const STALE_HOURS = 3;        // running longer than this -> failed

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// Walk an arbitrary object/array and collect (a) assistant/agent text and
// (b) file attachments, tolerating several possible Manus response shapes.
function extractFromMessages(payload: any): { md: string; attachments: any[] } {
  const messages: any[] = Array.isArray(payload)
    ? payload
    : payload?.messages || payload?.data || payload?.events || payload?.result?.messages || [];
  const texts: string[] = [];
  const attachments: any[] = [];

  const pushText = (t: unknown) => { if (typeof t === "string" && t.trim()) texts.push(t.trim()); };
  const pushAttachment = (a: any) => {
    if (!a) return;
    const url = a.url || a.file_url || a.download_url;
    if (url) attachments.push({ name: a.filename || a.name || a.file_name || "attachment", url, size: a.size ?? null });
  };

  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = m.role || m.author || m.sender || m.type;
    const isAgent = !role || ["assistant", "agent", "ai", "manus", "bot"].includes(String(role).toLowerCase());
    const content = m.content ?? m.text ?? m.message ?? m.body;

    if (isAgent) {
      if (typeof content === "string") pushText(content);
      else if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c === "string") pushText(c);
          else if (c && typeof c === "object") {
            if (c.type === "text" || c.text) pushText(c.text);
            if (c.type === "file" || c.file_url || c.url) pushAttachment(c);
          }
        }
      }
    }
    const atts = m.attachments || m.files;
    if (Array.isArray(atts)) atts.forEach(pushAttachment);
  }

  return { md: texts.join("\n\n").trim(), attachments };
}

function readStatus(detail: any): string {
  const s = detail?.status || detail?.agent_status || detail?.task?.status
    || detail?.data?.status || detail?.data?.agent_status || detail?.task_status || "";
  return String(s || "").toLowerCase();
}

async function manusGet(path: string, key: string): Promise<{ ok: boolean; status: number; body: any }> {
  const resp = await fetch(`${MANUS_BASE}${path}`, { headers: { "x-manus-api-key": key } });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body };
}

Deno.serve(async () => {
  const db = createClient(HUB_URL, SERVICE_KEY);

  const { data: secret } = await db
    .from("tenant_secrets").select("manus_api_key").eq("organization_id", ORG_ID).maybeSingle();
  const key = (secret?.manus_api_key as string) || "";
  if (!key) return json({ ok: false, error: "No Manus API key configured" });

  // Reaper: fail rows stuck running too long.
  await db.from("lead_research")
    .update({ status: "failed", error: "Timed out waiting for Manus", updated_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("created_at", new Date(Date.now() - STALE_HOURS * 3600_000).toISOString());

  const { data: rows } = await db
    .from("lead_research")
    .select("id, manus_task_id")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  const results: unknown[] = [];
  for (const row of rows || []) {
    if (!row.manus_task_id) continue;
    try {
      const detail = await manusGet(`/v2/task.detail?taskId=${encodeURIComponent(row.manus_task_id)}`, key);
      const status = readStatus(detail.body);
      if (detail.ok && status && IN_PROGRESS.has(status)) {
        results.push({ id: row.id, status });
        continue; // still working
      }

      // Terminal (or unknown) — try to pull the final output.
      const msgs = await manusGet(`/v2/task.listMessages?taskId=${encodeURIComponent(row.manus_task_id)}`, key);
      const { md, attachments } = extractFromMessages(msgs.body);
      const now = new Date().toISOString();

      if (md) {
        await db.from("lead_research").update({
          status: "complete",
          result_md: md,
          attachments,
          credit_usage: detail.body?.credit_usage ?? detail.body?.data?.credit_usage ?? null,
          raw: { detail: detail.body, messages: msgs.body },
          completed_at: now,
          updated_at: now,
        }).eq("id", row.id);
        results.push({ id: row.id, status: "complete" });
      } else {
        await db.from("lead_research").update({
          status: "failed",
          error: `No output (task status: ${status || "unknown"})`,
          raw: { detail: detail.body, messages: msgs.body },
          updated_at: now,
        }).eq("id", row.id);
        results.push({ id: row.id, status: "failed", detailStatus: status });
      }
    } catch (e) {
      results.push({ id: row.id, error: (e as Error).message });
    }
  }

  return json({ ok: true, processed: results });
});

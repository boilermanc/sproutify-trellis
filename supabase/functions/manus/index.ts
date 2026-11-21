// Trellis: Manus integration proxy
//
// Talks to the Manus Agent API (https://api.manus.ai) SERVER-SIDE so the org's
// Manus API key never reaches the browser. The key is read from tenant_secrets
// with the service_role key.
//
// Deploy WITH jwt verification (the default -- do NOT pass --no-verify-jwt).
//
// Ops (POST body):
//   { op: "test", apiKey? }      -> validate a Manus API key (typed or saved)
//   { op: "research", leadId }   -> kick off a deep-dive task for a lead
//
// The result is collected asynchronously by the `manus-poller` function (cron).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MANUS_BASE = "https://api.manus.ai";
const ORG_ID = "00000000-0000-0000-0000-000000000001";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function getSecrets(db: ReturnType<typeof createClient>) {
  const { data } = await db
    .from("tenant_secrets")
    .select("manus_api_key, manus_model")
    .eq("organization_id", ORG_ID)
    .maybeSingle();
  return {
    key: (data?.manus_api_key as string) || "",
    model: (data?.manus_model as string) || "manus-1.6",
  };
}

async function taskIsReadable(taskId: string, key: string): Promise<boolean> {
  // Manus task creation is asynchronous, but the task must become readable by
  // the same API key. A short retry window avoids recording jobs that can never
  // be polled and would otherwise sit in Trellis for three hours.
  for (const delay of [250, 750, 1500]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await fetch(`${MANUS_BASE}/v2/task.detail?task_id=${encodeURIComponent(taskId)}`, {
      headers: { "x-manus-api-key": key },
    });
    if (response.ok) return true;
    if (response.status !== 404) return true; // Let the poller retry transient failures.
  }
  return false;
}

// Build the deep-dive research prompt from a lead + its resolved profile.
function buildResearchPrompt(lead: any): string {
  const p = lead.profile || {};
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown contact";
  const lines = [
    `Contact name: ${name}`,
    p.email ? `Email: ${p.email}` : "",
    p.phone ? `Phone: ${p.phone}` : "",
    lead.source ? `Lead source: ${lead.source}` : "",
    lead.notes ? `Intake notes (may contain farm name, location, tower quantity, website and social links): ${lead.notes}` : "",
  ].filter(Boolean).join("\n");

  return [
    "You are a B2B sales research analyst for Sproutify Farm — farm-management software for aeroponic \"tower farm\" operations (tower capacity planning, seed-to-harvest workflows, task coordination). We partner with Tower Farm Corp to help new aeroponic farms get running.",
    "",
    "Produce a thorough but concise DEEP-DIVE DOSSIER on the following lead to prepare our team for outreach. Research the open web, including the contact's business website and social profiles if any are referenced in the notes.",
    "",
    "=== LEAD ===",
    lines,
    "=== END LEAD ===",
    "",
    "Cover, using clear Markdown sections with headings:",
    "1. Who they are — the person and their operation/business.",
    "2. Location & market context relevant to aeroponic/indoor farming.",
    "3. Online presence & signals — website, socials, recent activity, scale indicators.",
    "4. Fit & likely needs for Sproutify Farm; where our software would help most.",
    "5. Recommended outreach angle and specific talking points.",
    "6. Risks, gaps, and open questions to verify on a call.",
    "",
    "Rules: Output ONLY Markdown. Begin with a single H1 title naming the lead/operation. Be specific and cite what you actually found; clearly label anything uncertain or inferred. Do not fabricate details.",
  ].join("\n");
}

async function requireUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization header" }, 401);
  const authed = createClient(HUB_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await authed.auth.getUser();
  if (error || !data?.user) return json({ error: "Not authenticated" }, 401);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authFail = await requireUser(req);
  if (authFail) return authFail;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = createClient(HUB_URL, SERVICE_KEY);
  const op = body?.op;

  if (op === "test") {
    const typed = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const key = typed || (await getSecrets(db)).key;
    if (!key) return json({ ok: false, error: "No Manus API key saved yet." });
    try {
      const resp = await fetch(`${MANUS_BASE}/v2/task.list?limit=1`, {
        headers: { "x-manus-api-key": key },
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return json({ ok: false, error: payload?.error?.message || `Manus returned ${resp.status}` });
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: `Could not reach Manus: ${(e as Error).message}` });
    }
  }

  if (op === "research") {
    const leadId = body?.leadId;
    if (!leadId) return json({ ok: false, error: "leadId is required" });

    const { key, model } = await getSecrets(db);
    if (!key) return json({ ok: false, error: "No Manus API key saved. Add it in Settings first." });

    const { data: lead, error: leadErr } = await db
      .from("leads")
      .select("id, profile_id, branch_id, notes, source, profile:profiles(first_name,last_name,email,phone,tags)")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !lead) return json({ ok: false, error: "Lead not found" });

    const prompt = buildResearchPrompt(lead);

    let taskId = "";
    let taskUrl = "";
    try {
      const resp = await fetch(`${MANUS_BASE}/v2/task.create`, {
        method: "POST",
        headers: { "x-manus-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { content: [{ type: "text", text: prompt }] },
          agent_profile: model,
          hide_in_task_list: false,
          share_visibility: "private",
          title: "Trellis lead deep dive",
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.task_id) {
        return json({ ok: false, error: payload?.error?.message || `Manus task.create failed (${resp.status})` });
      }
      taskId = payload.task_id;
      taskUrl = payload.task_url || "";
      if (!(await taskIsReadable(taskId, key))) {
        return json({
          ok: false,
          error: "Manus created the task but cannot read it with the saved API key. Reconnect the Manus API key in Settings, then retry.",
        });
      }
    } catch (e) {
      return json({ ok: false, error: `Could not reach Manus: ${(e as Error).message}` });
    }

    const { data: row, error: insErr } = await db
      .from("lead_research")
      .insert({
        lead_id: lead.id,
        profile_id: lead.profile_id,
        branch_id: lead.branch_id,
        manus_task_id: taskId,
        manus_task_url: taskUrl,
        status: "running",
        model,
        prompt,
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("lead_research insert failed:", insErr.message);
      return json({ ok: false, error: "Task created but could not be recorded." });
    }

    return json({ ok: true, research_id: row.id, task_id: taskId, task_url: taskUrl });
  }

  return json({ error: `Unknown op: ${op}` }, 400);
});

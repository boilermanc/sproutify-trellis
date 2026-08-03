// campaign-sender — the durable outbox worker.
//
// Claims a due, queued campaign (claim_due_campaign flips it queued->sending so
// no other invocation can grab the same one), then sends its snapshot recipients
// (campaign_recipients, status='pending') via Resend /emails/batch in chunks of
// 100, marking each chunk sent/failed and recording resend ids into campaign_sends
// for attribution. Finalizes send_status = sent | partial | failed.
//
// Invoked two ways, same logic:
//   - pg_cron every 2 min (scheduled campaigns + resume/reaper)
//   - the app pings it right after an immediate enqueue (instant send)
//
// Retry-safe: already-'sent' recipients are skipped, so re-running only sends the
// leftover 'pending'/'failed' (after the app resets failed->pending). A crash
// leaves the campaign 'sending'; pg_cron's reaper requeues it after 15 min.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const CHUNK = 100;            // Resend /emails/batch hard limit
const RATE_LIMIT_MS = 550;    // stay under Resend's default 2 req/s
const MAX_CAMPAIGNS = 3;      // campaigns processed per invocation
const MAX_CHUNKS = 120;       // ~12k recipients/invocation; rest resumes via cron

type Rec = { id: string; email: string; first_name: string | null; unsubscribe_token: string | null };

function personalize(template: string, unsubTemplate: string, scope: string, r: Rec): string {
  const unsub = (unsubTemplate && r.unsubscribe_token)
    ? unsubTemplate.replace(/\{\{\s*token\s*\}\}/g, r.unsubscribe_token)
    : `${SUPABASE_URL}/functions/v1/unsubscribe?email=${encodeURIComponent(r.email)}&scope=${encodeURIComponent(scope)}`;
  return template
    .replace(/\{\{\s*first_name\s*\}\}/g, r.first_name || "Friend")
    .replace(/\{\{\s*email\s*\}\}/g, r.email)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsub);
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: secret } = await admin
    .from("tenant_secrets").select("resend_token, resend_from_address").limit(1).single();
  const resendToken = secret?.resend_token as string | undefined;
  const defaultFrom = (secret?.resend_from_address as string) || "ATL Urban Farms <sheree@atlurbanfarms.com>";

  const processed: unknown[] = [];

  for (let n = 0; n < MAX_CAMPAIGNS; n++) {
    const { data: claimed, error: claimErr } = await admin.rpc("claim_due_campaign");
    if (claimErr) { processed.push({ error: `claim: ${claimErr.message}` }); break; }
    const campaign = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!campaign || !campaign.id) break; // nothing due

    const d = campaign.dispatch || {};
    const subject: string = d.subject || campaign.subject || "";
    const from: string = d.from || defaultFrom;
    const template: string = d.html_template || "";
    const unsubTemplate: string = d.unsubscribe_url_template || "";

    // Per-branch unsubscribe scope. A single-branch campaign scopes the unsubscribe
    // link (and the suppression check) to that branch slug; a multi-branch campaign
    // falls back to 'global' so a recipient blasted across brands can't be left in a
    // half-unsubscribed state. 'global' also always matches bounces/complaints.
    const branchesArr: string[] = Array.isArray(campaign.branches) ? campaign.branches : [];
    const scope = branchesArr.length === 1 ? String(branchesArr[0]) : "global";

    const fail = async (msg: string) => {
      await admin.from("campaigns").update({
        send_status: "failed", send_error: msg, updated_at: new Date().toISOString(),
      }).eq("id", campaign.id);
      processed.push({ campaign: campaign.id, error: msg });
    };
    if (!resendToken) { await fail("resend_token not configured in tenant_secrets"); continue; }
    if (!template) { await fail("no html_template saved on campaign dispatch"); continue; }

    let sent = 0, failed = 0;
    for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
      const { data: pending, error: pErr } = await admin
        .from("campaign_recipients")
        .select("id,email,first_name,unsubscribe_token")
        .eq("campaign_id", campaign.id).eq("status", "pending")
        .order("created_at").limit(CHUNK);
      if (pErr) break;
      if (!pending || pending.length === 0) break;

      // Skip anyone who unsubscribed/bounced/complained since the snapshot. A row
      // scoped 'global' suppresses everywhere (bounces/complaints); a row scoped to
      // this campaign's branch suppresses just this brand's sends.
      const emails = pending.map((r: Rec) => r.email.toLowerCase());
      const { data: supp } = await admin.from("email_suppressions")
        .select("email").in("email", emails).in("scope", ["global", scope]);
      const suppressed = new Set((supp || []).map((s: { email: string }) => (s.email || "").toLowerCase()));
      const send = pending.filter((r: Rec) => !suppressed.has(r.email.toLowerCase()));
      const skip = pending.filter((r: Rec) => suppressed.has(r.email.toLowerCase()));
      if (skip.length) {
        await admin.from("campaign_recipients").update({
          status: "failed", error: "suppressed", sent_at: new Date().toISOString(),
        }).in("id", skip.map((r: Rec) => r.id));
        failed += skip.length;
      }
      if (send.length === 0) continue;

      const batch = send.map((r: Rec) => ({ from, to: [r.email], subject, html: personalize(template, unsubTemplate, scope, r) }));
      try {
        const resp = await fetch(RESEND_BATCH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${resendToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Resend ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`);
        const ids = Array.isArray(body.data) ? body.data : [];
        const now = new Date().toISOString();
        await admin.from("campaign_recipients").update({ status: "sent", sent_at: now })
          .in("id", send.map((r: Rec) => r.id));
        const sends = send
          .map((r: Rec, i: number) => ({ resend_email_id: ids[i]?.id, campaign_id: campaign.id, email: r.email, subject }))
          .filter((s) => !!s.resend_email_id);
        if (sends.length) await admin.from("campaign_sends").upsert(sends, { onConflict: "resend_email_id" });
        sent += send.length;
      } catch (e) {
        await admin.from("campaign_recipients").update({ status: "failed", error: String(e).slice(0, 300) })
          .in("id", send.map((r: Rec) => r.id));
        failed += send.length;
      }
      await new Promise((res) => setTimeout(res, RATE_LIMIT_MS));
    }

    // More pending than one invocation could handle? Requeue so cron resumes it.
    const { count: remaining } = await admin.from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("status", "pending");
    if (remaining && remaining > 0) {
      await admin.from("campaigns").update({ send_status: "queued", updated_at: new Date().toISOString() }).eq("id", campaign.id);
      processed.push({ campaign: campaign.id, sent, failed, remaining, status: "requeued" });
    } else {
      const finalStatus = failed === 0 ? "sent" : (sent === 0 ? "failed" : "partial");
      await admin.from("campaigns").update({
        send_status: finalStatus,
        send_error: failed ? `${failed} recipient(s) failed` : null,
        status: "completed",
        launched_at: campaign.launched_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", campaign.id);
      processed.push({ campaign: campaign.id, sent, failed, status: finalStatus });
    }
  }

  return json({ ok: true, processed });
});

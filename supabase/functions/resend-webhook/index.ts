import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Required in production: Resend's Svix signing secret. Never accept an unsigned
// event because webhook actions can suppress recipients and stop lead sequences.
const SIGNING_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";

// ATL spoke write-back (optional). When these are set, Resend engagement events
// for ATL campaigns are mirrored into ATL's newsletter_subscribers via its
// record_email_engagement RPC. Unset → the whole mirror is a no-op, so this is
// safe to ship before the secrets are configured.
const ATL_SPOKE_URL = Deno.env.get("ATL_SPOKE_URL") || "";
const ATL_SPOKE_KEY = Deno.env.get("ATL_SPOKE_SERVICE_KEY") || "";

// Event types worth mirroring (the RPC ignores anything else anyway).
const ATL_ENGAGE_TYPES = new Set(["sent", "delivered", "opened", "clicked", "bounced", "complained"]);

// Fire one engagement event at ATL's RPC. Never throws — the webhook must always
// return 200 to Resend regardless of whether the spoke is reachable.
async function notifyAtlEngagement(email: string, eventType: string, occurredAt: string): Promise<void> {
  if (!ATL_SPOKE_URL || !ATL_SPOKE_KEY) return; // not configured — no-op
  try {
    const resp = await fetch(`${ATL_SPOKE_URL}/rest/v1/rpc/record_email_engagement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ATL_SPOKE_KEY,
        Authorization: `Bearer ${ATL_SPOKE_KEY}`,
      },
      body: JSON.stringify({ p_email: email, p_event_type: eventType, p_occurred_at: occurredAt }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`ATL engagement sync ${resp.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("ATL engagement sync failed:", (e as Error).message);
  }
}

const TYPE_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

const htmlEscape = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

async function processInboundReply(supabase: any, evt: any): Promise<void> {
  const data = evt?.data || {};
  const destinations = Array.isArray(data.to) ? data.to.map(String) : [String(data.to || "")];
  const tokenMatch = destinations.join(" ").match(/lead\+([0-9a-f-]{36})@/i);
  if (!tokenMatch || !data.email_id) return;
  const replyToken = tokenMatch[1].toLowerCase();

  const { data: enrollment } = await supabase.from("lead_email_sequence_enrollments")
    .select("id,lead_id,profile_id").eq("reply_token", replyToken).maybeSingle();
  let leadId = enrollment?.lead_id || null;
  let profileId = enrollment?.profile_id || null;
  let enrollmentId = enrollment?.id || null;

  if (!leadId) {
    const { data: manualMessage } = await supabase.from("lead_email_messages")
      .select("lead_id,profile_id").contains("metadata", { reply_token: replyToken }).maybeSingle();
    leadId = manualMessage?.lead_id || null;
    profileId = manualMessage?.profile_id || null;
  }
  if (!leadId || !profileId) return;

  const { data: secret } = await supabase.from("tenant_secrets").select("resend_token").limit(1).single();
  const token = secret?.resend_token;
  let received: any = {};
  if (token) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${data.email_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) received = await response.json().catch(() => ({}));
  }

  const from = String(data.from || "").trim().toLowerCase();
  const subject = String(data.subject || "Reply from lead");
  const bodyText = String(received.text || "").trim();
  const preview = (bodyText || String(received.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
    .trim().slice(0, 4000);

  const { error: insertError } = await supabase.from("lead_email_messages").insert({
    enrollment_id: enrollmentId, lead_id: leadId, profile_id: profileId,
    direction: "inbound", status: "received", recipient_email: from,
    sender_email: from, subject, body_preview: preview,
    resend_email_id: data.email_id, provider_event_at: evt.created_at || new Date().toISOString(),
    metadata: { inbound_to: destinations, message_id: data.message_id || null },
  });
  if (insertError && insertError.code !== "23505") console.error("inbound message insert failed:", insertError.message);

  if (enrollmentId) {
    await supabase.from("lead_email_sequence_enrollments").update({
      status: "exited", exit_reason: "replied", next_run_at: null,
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", enrollmentId).in("status", ["active", "awaiting_approval", "paused"]);
  }
  await supabase.from("marketing_events").insert({
    profile_id: profileId, event_type: "lead_reply", source: "resend",
    payload: { lead_id: leadId, direction: "inbound", from, subject, preview, resend_email_id: data.email_id },
  });

  // Receiving domains route to Resend, so forward the human-readable reply to Sheree.
  if (token) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "Idempotency-Key": `lead-reply-forward/${data.email_id}`,
      },
      body: JSON.stringify({
        from: "Sproutify Farm Replies <sheree@sproutify.app>",
        to: ["sheree@sproutify.app"],
        reply_to: from || undefined,
        subject: `Lead reply: ${subject}`,
        html: `<p><strong>From:</strong> ${htmlEscape(from)}</p><p><strong>Subject:</strong> ${htmlEscape(subject)}</p><hr><div style="white-space:pre-wrap">${htmlEscape(preview || "No text body supplied.")}</div>`,
      }),
    });
  }
}

async function verifySvix(payload: string, headers: Headers): Promise<boolean> {
  if (!SIGNING_SECRET) return false;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  try {
    const secretBytes = Uint8Array.from(atob(SIGNING_SECRET.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${payload}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    // svix-signature: space-separated "v1,<base64>" entries
    return sig.split(" ").some((part) => part.split(",")[1] === expected);
  } catch (e) {
    console.error("svix verify error:", (e as Error).message);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const raw = await req.text();

  if (!SIGNING_SECRET) {
    console.error("RESEND_WEBHOOK_SECRET is not configured");
    return new Response("webhook verification is not configured", { status: 503 });
  }

  if (!(await verifySvix(raw, req.headers))) {
    return new Response("invalid signature", { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  if (evt?.type === "email.received") {
    try { await processInboundReply(supabase, evt); }
    catch (error) { console.error("inbound reply processing failed:", (error as Error).message); }
    return new Response("ok", { status: 200 });
  }

  const type = TYPE_MAP[evt?.type];
  const data = evt?.data || {};
  const email = Array.isArray(data.to)
    ? String(data.to[0] || "").toLowerCase()
    : String(data.to || data.email || "").toLowerCase();

  if (!type || !email) return new Response("ignored", { status: 200 });

  // Resolve campaign attribution via the send-time mapping recorded by the
  // campaign-sender worker when it writes campaign_sends. Older/transactional
  // sends have no row here — that's expected, campaign_id just stays null.
  let campaignId: string | null = null;
  let mappedSubject: string | null = null;
  if (data.email_id) {
    const { data: sendRow, error: sendErr } = await supabase
      .from("campaign_sends")
      .select("campaign_id, subject")
      .eq("resend_email_id", data.email_id)
      .maybeSingle();
    if (sendErr) {
      console.error("campaign_sends lookup failed:", sendErr.message);
    } else if (sendRow) {
      campaignId = sendRow.campaign_id ?? null;
      mappedSubject = sendRow.subject ?? null;
    }
  }

  // Lead emails are attributed by exact Resend ID, independent of subject reuse.
  let leadMessage: { id: string; enrollment_id: string | null; lead_id: string; profile_id: string } | null = null;
  if (data.email_id) {
    const { data: message, error: messageError } = await supabase.from("lead_email_messages")
      .select("id,enrollment_id,lead_id,profile_id").eq("resend_email_id", data.email_id).maybeSingle();
    if (messageError) console.error("lead email message lookup failed:", messageError.message);
    else leadMessage = message;
  }

  // Resolve the campaign's single-brand scope once — used both to scope an
  // unsubscribe and to decide whether to mirror engagement to the ATL spoke.
  let campaignBrand = "";
  if (campaignId) {
    const { data: camp } = await supabase.from("campaigns").select("branches").eq("id", campaignId).maybeSingle();
    const branches = Array.isArray(camp?.branches) ? camp!.branches : [];
    campaignBrand = branches.length === 1 ? String(branches[0]).trim().toLowerCase() : "";
  }

  const { error: insErr } = await supabase.from("email_events").insert({
    email,
    event_type: type,
    resend_email_id: data.email_id || null,
    campaign_subject: data.subject || mappedSubject || null,
    campaign_id: campaignId,
    link_url: type === "clicked" ? (data?.click?.link || null) : null,
    metadata: data,
    occurred_at: evt?.created_at || new Date().toISOString(),
  });
  // 23505 = duplicate (webhook retry) — safe to ignore
  if (insErr && insErr.code !== "23505") console.error("event insert failed:", insErr.message);

  if (leadMessage) {
    await supabase.from("lead_email_messages").update({
      status: type,
      provider_event_at: evt?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: data,
      last_error: type === "failed" ? String(data?.failed?.reason || data?.reason || "Delivery failed").slice(0, 1000) : null,
    }).eq("id", leadMessage.id);

    if (["bounced", "complained", "failed", "suppressed"].includes(type) && leadMessage.enrollment_id) {
      await supabase.from("lead_email_sequence_enrollments").update({
        status: "exited", exit_reason: `email_${type}`, next_run_at: null,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", leadMessage.enrollment_id).in("status", ["active", "awaiting_approval", "paused"]);
    }
  }

  const occurredAt = evt?.created_at || new Date().toISOString();

  // Mirror engagement into ATL's own subscriber list (opens/clicks/bounces/
  // complaints). Only on a FRESH insert (no error) so webhook retries can't
  // double-count, and only for ATL sends. No-op unless ATL secrets are set.
  if (!insErr && campaignBrand === "atlurbanfarms" && ATL_ENGAGE_TYPES.has(type)) {
    await notifyAtlEngagement(email, type, occurredAt);
  }

  // Treat a click on an unsubscribe link as an unsubscribe. Brand newsletters
  // (e.g. ATL) route opt-outs to their OWN spoke endpoint, so those clicks never
  // reach our /unsubscribe function and would otherwise never land in
  // email_suppressions — leaving Trellis reporting under-counting unsubscribes and
  // (worse) still able to re-email people who opted out. We derive the suppression
  // straight from the tracked click event instead. Idempotent via (email,scope).
  if (type === "clicked") {
    const clicked = String(data?.click?.link || "");
    if (/unsubscribe/i.test(clicked)) {
      // Prefer an explicit scope carried in the link (our own Hub links do this);
      // otherwise scope to the campaign's single brand, matching campaign-sender's
      // rule (branches.length === 1 ? branch : 'global'). Falls back to global.
      let scope = "";
      try {
        const u = new URL(clicked);
        scope = (u.searchParams.get("scope") || u.searchParams.get("source") || "").trim().toLowerCase();
      } catch { /* link isn't a parseable URL */ }
      if (!scope) scope = campaignBrand || "global";
      const { error: unsubErr } = await supabase.from("email_suppressions").upsert(
        {
          email,
          scope,
          reason: "unsubscribe",
          source: "unsubscribe-click",
          campaign_subject: data.subject || mappedSubject || null,
          detail: data,
          created_at: new Date().toISOString(),
        },
        { onConflict: "email,scope" },
      );
      if (unsubErr) console.error("unsubscribe-click suppress failed:", unsubErr.message);

      // Reflect the opt-out in ATL's own subscriber list too — Hub-link clicks
      // never reach ATL's own unsubscribe endpoint on their own.
      if (campaignBrand === "atlurbanfarms" || scope === "atlurbanfarms") {
        await notifyAtlEngagement(email, "unsubscribed", occurredAt);
      }
    }
  }

  // Auto-suppress on complaint or hard bounce
  if (type === "complained" || type === "bounced") {
    const bounceType = String(data?.bounce?.type || data?.type || "").toLowerCase();
    const isHard = type === "complained" || bounceType.includes("hard") || bounceType.includes("permanent") || bounceType === "";
    if (isHard) {
      // Bounces and complaints are address-level (ISP/deliverability), so they
      // always suppress globally — never scope these to a single branch.
      await supabase.from("email_suppressions").upsert(
        {
          email,
          scope: "global",
          reason: type === "complained" ? "complaint" : "bounce",
          source: "resend",
          campaign_subject: data.subject || null,
          detail: data,
        },
        { onConflict: "email,scope" },
      );
    }
  }

  return new Response("ok", { status: 200 });
});

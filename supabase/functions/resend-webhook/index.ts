import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional: set RESEND_WEBHOOK_SECRET (whsec_...) in Edge Function secrets to enforce
// Svix signature verification. If unset, events are accepted without verification.
const SIGNING_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";

const TYPE_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

async function verifySvix(payload: string, headers: Headers): Promise<boolean> {
  if (!SIGNING_SECRET) return true; // verification disabled
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

  if (!(await verifySvix(raw, req.headers))) {
    return new Response("invalid signature", { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const type = TYPE_MAP[evt?.type];
  const data = evt?.data || {};
  const email = Array.isArray(data.to)
    ? String(data.to[0] || "").toLowerCase()
    : String(data.to || data.email || "").toLowerCase();

  if (!type || !email) return new Response("ignored", { status: 200 });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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

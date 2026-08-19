import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { composeOperatorHtml, LEAD_CC, LEAD_FROM, leadReplyTo, LEAD_TEST_RECIPIENT, resendToken } from "../_shared/lead-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") || "";
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: operator } = await admin.from("trellis_users").select("role,status")
    .eq("auth_user_id", user.id).eq("status", "active").in("role", ["owner", "admin", "operator"]).maybeSingle();
  if (!operator) return json({ error: "Marketing operator access required" }, 403);

  let input: any;
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const leadId = String(input.leadId || "");
  const subject = String(input.subject || "").trim();
  const body = String(input.body || "");
  const bodyFormat = input.bodyFormat === "html" ? "html" : "text";
  const isTest = input.test === true;
  if (!leadId || !subject || !body) return json({ error: "leadId, subject, and body are required" }, 400);

  const { data: lead } = await admin.from("leads").select("id,profile_id,branch_id,stage,status,profiles(email,first_name,marketing_pause,is_subscribed)")
    .eq("id", leadId).maybeSingle();
  const profile: any = Array.isArray(lead?.profiles) ? lead.profiles[0] : lead?.profiles;
  if (!lead || !profile?.email) return json({ error: "Lead email was not found" }, 404);

  const recipient = isTest ? LEAD_TEST_RECIPIENT : String(profile.email).trim().toLowerCase();
  if (!isTest) {
    const { data: suppressed } = await admin.from("email_suppressions").select("reason").eq("email", recipient)
      .in("reason", ["unsubscribe", "bounce", "complaint"]).limit(1);
    if (profile.marketing_pause || profile.is_subscribed === false || suppressed?.length) {
      return json({ error: "This lead is suppressed or unsubscribed" }, 409);
    }
  }

  const messageId = crypto.randomUUID();
  const replyToken = crypto.randomUUID();
  if (!isTest) {
    await admin.from("lead_email_messages").insert({
      id: messageId, lead_id: lead.id, profile_id: lead.profile_id, direction: "outbound",
      status: "processing", recipient_email: recipient, subject,
      body_preview: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
      metadata: { body_format: bodyFormat, manual: true, reply_token: replyToken },
    });
  }

  try {
    const { token } = await resendToken(admin);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "Idempotency-Key": `${isTest ? "lead-test" : "lead-manual"}/${messageId}`,
      },
      body: JSON.stringify({
        from: LEAD_FROM, to: [recipient], cc: isTest ? undefined : (Array.isArray(input.cc) ? input.cc : LEAD_CC),
        reply_to: isTest ? "sheree@sproutify.app" : leadReplyTo(replyToken),
        subject: isTest ? `[TEST] ${subject.replace(/^\[TEST\]\s*/i, "")}` : subject,
        html: composeOperatorHtml(body, bodyFormat, recipient, String(input.scope || "sproutify-farm")),
        tags: isTest ? [{ name: "category", value: "lead_test" }] : [
          { name: "message_id", value: messageId.replace(/-/g, "_") },
          { name: "lead_id", value: lead.id.replace(/-/g, "_") },
        ],
      }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || !responseBody.id) throw new Error(`Resend ${response.status}: ${JSON.stringify(responseBody).slice(0, 500)}`);
    if (!isTest) {
      await admin.from("lead_email_messages").update({
        status: "sent", resend_email_id: responseBody.id, sent_at: new Date().toISOString(),
        provider_event_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", messageId);
      await admin.from("marketing_events").insert({
        profile_id: lead.profile_id, event_type: "lead_email", source: "manual",
        payload: {
          lead_id: lead.id, branch_id: lead.branch_id, subject, to: recipient,
          cc: Array.isArray(input.cc) ? input.cc : LEAD_CC, direction: "outbound",
          body, body_format: bodyFormat, resend_email_id: responseBody.id, message_id: messageId,
        },
      });
      if (lead.stage === "new") await admin.from("leads").update({ stage: "contacted", updated_at: new Date().toISOString() }).eq("id", lead.id);
    }
    return json({ id: responseBody.id, messageId, test: isTest });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTest) await admin.from("lead_email_messages").update({ status: "failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", messageId);
    return json({ error: message }, 502);
  }
});

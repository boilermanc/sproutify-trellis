import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LEAD_CC, LEAD_FROM, leadReplyTo, resendToken, sequenceHtml } from "../_shared/lead-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "content-type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { token } = await resendToken(admin);
  const { data: claims, error: claimError } = await admin.rpc("claim_due_lead_email_messages", { p_limit: 20 });
  if (claimError) return json({ error: claimError.message }, 500);

  const results: unknown[] = [];
  for (const claim of claims || []) {
    const html = sequenceHtml(claim.template_key, claim.first_name, claim.recipient_email, claim.branch_slug);
    const replyTo = leadReplyTo(claim.reply_token);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `lead-sequence/${claim.message_id}`,
        },
        body: JSON.stringify({
          from: LEAD_FROM,
          to: [claim.recipient_email],
          cc: LEAD_CC,
          reply_to: replyTo,
          subject: claim.subject,
          html,
          tags: [
            { name: "message_id", value: String(claim.message_id).replace(/-/g, "_") },
            { name: "lead_id", value: String(claim.lead_id).replace(/-/g, "_") },
            { name: "sequence_step", value: String(claim.step_number) },
          ],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.id) throw new Error(`Resend ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);

      const { error: completeError } = await admin.rpc("complete_lead_email_message", {
        p_message_id: claim.message_id, p_resend_email_id: body.id, p_error: null,
      });
      if (completeError) throw completeError;
      await admin.from("marketing_events").insert({
        profile_id: claim.profile_id,
        event_type: "lead_email",
        source: "sequence",
        payload: {
          lead_id: claim.lead_id, subject: claim.subject, to: claim.recipient_email,
          cc: LEAD_CC, direction: "outbound", resend_email_id: body.id,
          sequence_step: claim.step_number, message_id: claim.message_id,
        },
      });
      if (claim.step_number === 1) {
        await admin.from("leads").update({ stage: "contacted", updated_at: new Date().toISOString() })
          .eq("id", claim.lead_id).eq("stage", "new");
      }
      results.push({ message_id: claim.message_id, status: "sent", resend_email_id: body.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.rpc("complete_lead_email_message", {
        p_message_id: claim.message_id, p_resend_email_id: null, p_error: message,
      });
      results.push({ message_id: claim.message_id, status: "failed", error: message });
    }
  }
  return json({ ok: true, processed: results.length, results });
});

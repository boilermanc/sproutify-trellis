import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

interface Reminder {
  reminder_id: string;
  project_id: string;
  experiment_id: string;
  post_id: string;
  hypothesis: string;
  review_due_at: string;
  attempt_count: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!serviceRoleKey || bearer !== serviceRoleKey) return json({ error: "Forbidden" }, 403);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: enqueued, error: enqueueError } = await db.rpc("enqueue_due_content_experiment_reminders");
  if (enqueueError) return json({ error: `Could not enqueue reminders: ${enqueueError.message}` }, 500);

  const { data: reminders, error: claimError } = await db.rpc("claim_content_experiment_review_reminders", { p_limit: 25 });
  if (claimError) return json({ error: `Could not claim reminders: ${claimError.message}` }, 500);

  const claimed = (reminders || []) as Reminder[];
  if (claimed.length === 0) return json({ enqueued: enqueued || 0, claimed: 0, delivered: 0, failed: 0 });

  const { data: secrets, error: secretError } = await db
    .from("tenant_secrets")
    .select("slack_webhook")
    .eq("organization_id", ORG_ID)
    .maybeSingle();
  const slackWebhook = secrets?.slack_webhook || "";
  const deliveryError = secretError ? `Could not load Slack configuration: ${secretError.message}` : "Slack webhook is not configured";

  let delivered = 0;
  let failed = 0;
  for (const reminder of claimed) {
    try {
      if (!slackWebhook) throw new Error(deliveryError);
      const due = new Date(reminder.review_due_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      const response = await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Content experiment review due: ${reminder.experiment_id}`,
          blocks: [
            { type: "header", text: { type: "plain_text", text: "Content experiment review due" } },
            { type: "section", text: { type: "mrkdwn", text: `*Project:* ${reminder.project_id}\n*Experiment:* ${reminder.experiment_id}\n*Post:* ${reminder.post_id}\n*Due:* ${due}` } },
            { type: "section", text: { type: "mrkdwn", text: `*Hypothesis*\n${reminder.hypothesis}` } },
            { type: "context", elements: [{ type: "mrkdwn", text: "Open Trellis → Content Intelligence → Experiments to review the result." }] },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Slack returned ${response.status}`);

      const { error } = await db.rpc("complete_content_experiment_review_reminder", {
        p_reminder_id: reminder.reminder_id,
        p_success: true,
        p_error: null,
      });
      if (error) throw new Error(error.message);
      delivered += 1;
    } catch (error) {
      failed += 1;
      await db.rpc("complete_content_experiment_review_reminder", {
        p_reminder_id: reminder.reminder_id,
        p_success: false,
        p_error: error instanceof Error ? error.message : "Unknown delivery failure",
      });
    }
  }

  return json({ enqueued: enqueued || 0, claimed: claimed.length, delivered, failed });
});

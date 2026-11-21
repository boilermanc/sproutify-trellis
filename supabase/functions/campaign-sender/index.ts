import { authorizeNewsletterWorker, newsletterWorkerMethod } from '../_shared/newsletter-worker-guard.mjs';
import { readNewsletterProjectBindings, newsletterBranchProject, newsletterDispatchAllowed } from '../_shared/newsletter-project-bindings.mjs';
import { loadReminder } from '../_shared/newsletter-resend-data.ts';
import { renderReminder, validateRendered, ResendSafetyError } from '../_shared/newsletter-resend.mjs';
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

function buildUnsubscribeUrl(unsubTemplate: string, scope: string, r: Rec): string {
  return (unsubTemplate && r.unsubscribe_token)
    ? unsubTemplate.replace(/\{\{\s*token\s*\}\}/g, r.unsubscribe_token)
    : `${SUPABASE_URL}/functions/v1/unsubscribe?email=${encodeURIComponent(r.email)}&scope=${encodeURIComponent(scope)}`;
}

function personalize(template: string, unsubscribeUrl: string, r: Rec): string {
  const firstName = r.first_name?.trim() || "";
  const personalized = template.replace(
    /<!--\s*IF_FIRST_NAME\s*-->([\s\S]*?)<!--\s*END_IF_FIRST_NAME\s*-->/gi,
    (_match, content: string) => firstName ? content : "",
  );
  return personalized
    // Templates without a conditional greeting retain the established fallback.
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName || "Friend")
    .replace(/\{\{\s*email\s*\}\}/g, r.email)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsubscribeUrl);
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "Access-Control-Allow-Origin":"*" } });

Deno.serve(async (req: Request) => {
  const method = newsletterWorkerMethod(req); if (method) return method;
  let bindings;
  try { bindings=readNewsletterProjectBindings((name: string)=>Deno.env.get(name)); }
  catch { return json({error:'Newsletter project bindings unavailable. Dispatch is disabled.'},503); }
  if (!newsletterDispatchAllowed(bindings,Deno.env.get('NEWSLETTER_DISPATCH_ENABLED'))) {
    return json({error:'Newsletter dispatch is disabled for this environment.'},503);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const denied=await authorizeNewsletterWorker(req,{
    schedulerToken:Deno.env.get('NEWSLETTER_WORKER_TOKEN'),
    authenticate:async (token: string)=>{
      const {data,error}=await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    findStaff:async (id: string)=>{
      const {data,error}=await admin.from('trellis_users').select('auth_user_id,status,role').eq('auth_user_id',id).maybeSingle();
      return error ? null : data;
    },
  });
  if (denied) return denied;

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
    const cc: string | undefined = typeof d.cc === "string" && d.cc.trim() ? d.cc.trim() : undefined;
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
    try {
      if (!branchesArr.length) throw new Error('missing branch');
      for (const slug of branchesArr) newsletterBranchProject(bindings,slug);
    } catch { await fail('Campaign branch is not enabled in the server newsletter manifest.'); continue; }
    if (!resendToken) { await fail("resend_token not configured in tenant_secrets"); continue; }
    if (!template) { await fail("no html_template saved on campaign dispatch"); continue; }

    const isReminder = !!campaign.metadata?.resend_of;
    const reminderAge = Date.now() - Date.parse(campaign.created_at);
    if (isReminder && (campaign.metadata.resend_safety_version !== 1 ||
      !Number.isFinite(reminderAge) || reminderAge < 0 || reminderAge > 23 * 60 * 60 * 1000)) {
      await fail('Reminder is legacy/unvalidated or outside the safe provider retry window. Review a new preview; do not retry this campaign.'); continue;
    }
    // Validate resolved merge fields rather than rejecting supported templates.
    try { renderReminder(subject, template, {email:'validation@example.invalid',first_name:'Friend'}, 'https://example.invalid/unsubscribe'); }
    catch { await fail('Unresolved placeholder in subject or email body. Correct the saved email (for example [DATE]) before sending.'); continue; }

    let sent = 0, failed = 0;
    const invocationStarted = Date.now();
    for (let chunk = 0; chunk < MAX_CHUNKS && (!isReminder || Date.now() - invocationStarted < 45000); chunk++) {
      const { data: pending, error: pErr } = await admin
        .from("campaign_recipients")
        .select("id,email,first_name,unsubscribe_token")
        .eq("campaign_id", campaign.id).eq("status", "pending")
        .order("created_at").order("id").limit(isReminder ? 1 : CHUNK);
      if (pErr) { await fail('Recipient data unavailable'); return json({ok:false,processed}); }
      if (!pending || pending.length === 0) break;
      if (isReminder) {
        try {
          const { bundle, audience } = await loadReminder(admin, {
            campaignId: campaign.metadata.resend_of, branch: scope, userId: campaign.owner_id,
          }, subject);
          if (audience.fingerprint !== campaign.metadata.resend_fingerprint || template !== bundle.campaign.dispatch.html_template ||
            from !== (bundle.campaign.dispatch.from || defaultFrom) || cc ||
            unsubTemplate !== (bundle.campaign.dispatch.unsubscribe_url_template || '')) throw new Error('changed');
          for (const recipient of pending) {
            const approved=audience.recipients.find((row: any)=>row.email===recipient.email);
            if (!approved || approved.first_name!==(recipient.first_name || '') ||
              approved.unsubscribe_token!==(recipient.unsubscribe_token || '')) throw new Error('outbox changed');
          }
        } catch {
          await fail('Reminder audience, consent, content, or event coverage changed/unavailable. Sending stopped; review a new preview.');
          // Never let finalization overwrite this fail-closed state.
          return json({ ok: false, processed });
        }
      }

      // Skip anyone who unsubscribed/bounced/complained since the snapshot. A row
      // scoped 'global' suppresses everywhere (bounces/complaints); a row scoped to
      // this campaign's branch suppresses just this brand's sends.
      const emails = pending.map((r: Rec) => r.email.toLowerCase());
      const { data: supp, error: suppError } = await admin.from("email_suppressions")
        .select("email").in("email", emails).in("scope", ["global", scope]);
      if (suppError) { await fail('Suppression status unavailable. No further mail sent.'); return json({ok:false,processed}); }
      const suppressed = new Set((supp || []).map((s: { email: string }) => (s.email || "").toLowerCase()));
      const send = pending.filter((r: Rec) => !suppressed.has(r.email.toLowerCase()));
      const skip = pending.filter((r: Rec) => suppressed.has(r.email.toLowerCase()));
      if (isReminder && skip.length) { await fail('Suppression changed. Review a new preview before continuing.'); return json({ok:false,processed}); }
      if (skip.length) {
        await admin.from("campaign_recipients").update({
          status: "failed", error: "suppressed", sent_at: new Date().toISOString(),
        }).in("id", skip.map((r: Rec) => r.id));
        failed += skip.length;
      }
      if (send.length === 0) continue;

      try {
        const batch = send.map((r: Rec) => {
          const unsubscribeUrl = buildUnsubscribeUrl(unsubTemplate, scope, r);
          return {
            from,
            to: [r.email],
            ...(cc ? { cc: [cc] } : {}),
            ...(isReminder ? renderReminder(subject, template, r, unsubscribeUrl) : {subject, html: personalize(template, unsubscribeUrl, r)}),
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        });
        for (const message of batch) validateRendered(message.subject, message.html);
        const resp = await fetch(isReminder ? 'https://api.resend.com/emails' : RESEND_BATCH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${resendToken}`, "Content-Type": "application/json",
            ...(isReminder ? { 'Idempotency-Key': `newsletter-reminder/${campaign.id}/${send[0].id}` } : {}) },
          body: JSON.stringify(isReminder ? batch[0] : batch),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error('Provider request failed');
        const ids = isReminder ? [body] : Array.isArray(body.data) ? body.data : [];
        if (ids.length !== send.length || ids.some((row: any) => !row.id)) throw new Error('Provider message IDs missing');
        const now = new Date().toISOString();
        const sends = send
          .map((r: Rec, i: number) => ({ resend_email_id: ids[i]?.id, campaign_id: campaign.id, email: r.email, subject }))
          .filter((s) => !!s.resend_email_id);
        if (sends.length) {
          const {error} = await admin.from("campaign_sends").upsert(sends, { onConflict: "resend_email_id" });
          if (error) throw new Error('Provider attribution could not be saved');
        }
        const {error: savedError} = await admin.from("campaign_recipients").update({ status: "sent", sent_at: now })
          .in("id", send.map((r: Rec) => r.id));
        if (savedError) throw new Error('Recipient status could not be saved');
        sent += send.length;
      } catch (error) {
        if (error instanceof ResendSafetyError) { await fail(error.message); return json({ok:false,processed}); }
        if (isReminder) {
          // Leave pending so the same per-recipient provider key is reused. No
          // unbounded retries beyond Resend's 24h idempotency retention window.
          await fail('Reminder delivery uncertain or provider unavailable. Retry within 23 hours only after review.');
          return json({ok:false,processed});
        }
        await admin.from("campaign_recipients").update({ status: "failed", error: 'Provider delivery or attribution failed' })
          .in("id", send.map((r: Rec) => r.id));
        failed += send.length;
      }
      await new Promise((res) => setTimeout(res, RATE_LIMIT_MS));
    }

    // More pending than one invocation could handle? Requeue so cron resumes it.
    const { count: remaining, error: remainingError } = await admin.from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("status", "pending");
    if (remainingError || remaining === null) { await fail('Remaining recipient count unavailable. Review the outbox before retrying.'); return json({ok:false,processed}); }
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

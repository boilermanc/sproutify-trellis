import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertCampaign, prepareReminder, ResendSafetyError } from './newsletter-resend.mjs';
import { readBranchConsent } from './newsletter-consent.mjs';
import { readNewsletterProjectBindings, newsletterBranchProject } from './newsletter-project-bindings.mjs';

export async function loadReminder(admin: any, selection: { campaignId: string; branch: string; userId: string }, subject: string,
  createSpoke = createClient, consentKey = Deno.env.get('ATL_SPOKE_SERVICE_KEY') || '',
  bindings = readNewsletterProjectBindings((name: string)=>Deno.env.get(name))) {
  const project=newsletterBranchProject(bindings,selection.branch);
  const { data: bundle, error } = await admin.rpc('newsletter_resend_source', {
    p_campaign_id: selection.campaignId, p_user_id: selection.userId, p_branch: selection.branch,
  });
  if (error || !bundle) throw new ResendSafetyError('Original campaign or engagement records unavailable, or access denied.');
  assertCampaign(bundle.campaign, selection, bundle.authorized_for);
  const { data: branch, error: branchError } = await admin.from('branches')
    .select('spoke_connection_id,is_active').eq('slug', selection.branch).single();
  if (branchError || !branch) throw new ResendSafetyError('Newsletter consent branch is unavailable.');
  if (!Array.isArray(bundle.recipients)) throw new ResendSafetyError('Original recipient data is unavailable.');
  const eligible = await readBranchConsent(admin, branch, selection.branch, createSpoke, consentKey, bundle.recipients.map((row: any)=>row.email), bindings);
  return { bundle, audience: await prepareReminder(bundle, eligible, selection, subject,
    {environment:bindings.environment,hub:bindings.hub,project}) };
}

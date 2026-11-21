import { requireSamePreview, ResendSafetyError } from '../_shared/newsletter-resend.mjs';

// Dependencies are injected so tests exercise the actual request path without mail.
export function createReminderHandler({ authenticate, load, sign, verify, enqueue, now = Date.now }) {
  return async (body, authorization) => {
    const userId = await authenticate(authorization);
    if (!userId) throw new ResendSafetyError('Sign in as authorized Trellis staff to continue.');
    if (!['preview','send'].includes(body.action)) throw new ResendSafetyError('Choose preview or send.');
    const selection = { campaignId: body.campaign_id, branch: body.branch, userId };
    const subject = String(body.subject || '').trim();
    const { bundle, audience } = await load(selection, subject);
    if (body.action === 'preview') {
      const token = await sign({ ...selection, subject, fingerprint: audience.fingerprint, expires_at: now() + 10 * 60 * 1000 });
      return { preview: { token, campaign_id: bundle.campaign.id, name: bundle.campaign.name,
        original_subject: bundle.campaign.subject, total: audience.total, exclusions: audience.exclusions,
        final_count: audience.final_count, sample: audience.recipients.slice(0,5).map((row, index) => `Eligible recipient ${row.source_recipient_id?.slice(0,8) || index + 1} (address hidden)`) } };
    }
    const preview = await verify(body.preview_token);
    if (!preview || preview.campaignId !== selection.campaignId || preview.branch !== selection.branch || preview.userId !== userId || preview.subject !== subject) throw new ResendSafetyError('Preview does not match the selected campaign, business, staff account, or subject. Review a new preview.');
    requireSamePreview(preview, audience, now());
    return { campaign: await enqueue({ selection, subject, bundle, audience }) };
  };
}

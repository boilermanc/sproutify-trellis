// Shared by the preview endpoint and the outbox worker. Never matches subjects.
export class ResendSafetyError extends Error {}
const stop = (message) => { throw new ResendSafetyError(message); };
const key = (email) => String(email || '').trim().toLowerCase();
export function assertCampaign(campaign, { campaignId, branch, userId }, authorizedFor = null) {
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(campaignId || '') || campaignId === '00000000-0000-0000-0000-000000000000') stop('Select a valid original campaign ID.');
  // authorizedFor comes only from the service-only source RPC after checking
  // active staff ownership/operator permission, never from the request body.
  if (!campaign || campaign.id !== campaignId || (campaign.owner_id !== userId && authorizedFor !== userId)) stop('Original campaign not found or not authorized.');
  if (!branch || campaign.branches?.length !== 1 || campaign.branches[0] !== branch) stop('Original campaign business does not match the selected business.');
  if (!['sent', 'partial'].includes(campaign.send_status) || campaign.metadata?.resend_of) stop('Select a sent original campaign, not a reminder.');
  if (!campaign.dispatch?.html_template) stop('Original campaign has no saved email body.');
}

export function validateRendered(subject, html) {
  if (!String(subject || '').trim() || !String(html || '').trim()) stop('Subject and email body are required.');
  // Decode common editor entities before checking. Square brackets with uppercase
  // names are editorial placeholders; ordinary prose brackets remain valid.
  const text = `${subject}\n${html}`.replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
    .replace(/&(?:lbrack|lsqb);/gi, '[').replace(/&(?:rbrack|rsqb);/gi, ']');
  if (/\[\s*[A-Z][A-Z0-9_ -]*\s*\]|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\*\|[^|]+\|\*/.test(text + '\n' + text.replace(/<[^>]*>/g, ''))) stop('Unresolved placeholder in subject or email body. Replace editorial placeholders (for example [DATE]) and unsupported merge fields, then preview again.');
}

export function renderReminder(subject, template, recipient, unsubscribeUrl) {
  const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const render = (text, html) => text
    .replace(/<!--\s*IF_FIRST_NAME\s*-->([\s\S]*?)<!--\s*END_IF_FIRST_NAME\s*-->/gi, (_, content) => recipient.first_name?.trim() ? content : '')
    .replace(/\{\{\s*(first_name|email|unsubscribe_url)\s*\}\}/g, (_, field) => {
      const value = field === 'first_name' ? recipient.first_name?.trim() || 'Friend' : field === 'email' ? recipient.email : unsubscribeUrl;
      return html ? escape(value) : value;
    });
  const rendered = { subject: render(subject, false), html: render(template, true) };
  validateRendered(rendered.subject, rendered.html);
  return rendered;
}

export function buildResendAudience(bundle, eligible) {
  if (!bundle || !Array.isArray(bundle.recipients) || !Array.isArray(bundle.sends) || !Array.isArray(bundle.events) || !Array.isArray(bundle.suppressions) || !Array.isArray(eligible)) stop('Engagement or consent data could not be verified. No reminder was queued.');
  const rows = bundle.recipients;
  if (!rows.length) stop('Original campaign has no sent recipients.');
  const mappings = new Map(), sendsByEmail = new Map();
  for (const send of bundle.sends) {
    if (send.campaign_id !== bundle.campaign.id || !send.resend_email_id || mappings.has(send.resend_email_id)) stop('Original provider message IDs are missing or ambiguous.');
    mappings.set(send.resend_email_id, send);
    const address = key(send.email);
    sendsByEmail.set(address, [...(sendsByEmail.get(address) || []), send]);
  }
  const events = new Map(), outcomes = new Set();
  for (const event of bundle.events) {
    const send = mappings.get(event.resend_email_id);
    if (!send || (event.campaign_id && event.campaign_id !== bundle.campaign.id) || key(send.email) !== key(event.email)) stop('Provider event attribution does not match the original campaign.');
    const kinds = events.get(key(send.email)) || new Set();
    kinds.add(event.event_type);
    events.set(key(send.email), kinds);
    if (['delivered','bounced','complained','failed','suppressed'].includes(event.event_type)) outcomes.add(send.resend_email_id);
  }
  const consent = new Set(eligible.map(row => key(row.email)));
  const suppressed = new Map(bundle.suppressions.map(row => [key(row.email), row.reason]));
  const counts = { opened: 0, bounced_or_complained: 0, suppressed_or_unsubscribed: 0, no_current_consent: 0, not_delivered: 0 };
  const seen = new Set(), recipients = [];
  for (const row of rows) {
    const email = key(row.email);
    if (!email || seen.has(email)) stop('Original recipients are missing or ambiguous.');
    seen.add(email);
    const sends = sendsByEmail.get(email) || [];
    if (sends.length !== 1) stop('Original recipient has missing or ambiguous provider message ID.');
    // A successful empty query alone does not prove engagement coverage. Require
    // a terminal delivery outcome for every original message, including zero-open cases.
    if (!outcomes.has(sends[0].resend_email_id)) stop('Original engagement data is incomplete. Verify webhook delivery/event coverage before previewing again.');
    const kinds = events.get(email) || new Set();
    if (kinds.has('opened') || kinds.has('clicked')) counts.opened++;
    else if (kinds.has('bounced') || kinds.has('complained')) counts.bounced_or_complained++;
    else if (suppressed.has(email)) counts.suppressed_or_unsubscribed++;
    else if (!consent.has(email)) counts.no_current_consent++;
    else if (!kinds.has('delivered') || kinds.has('failed') || kinds.has('suppressed')) counts.not_delivered++;
    else recipients.push({ email, first_name: row.first_name || '', unsubscribe_token: row.unsubscribe_token || '', source_recipient_id: row.id || '' });
  }
  recipients.sort((a,b) => a.email.localeCompare(b.email));
  return { recipients, total: rows.length, exclusions: counts, final_count: recipients.length };
}

export async function fingerprint(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareReminder(bundle, eligible, selection, subject) {
  assertCampaign(bundle?.campaign, selection, bundle?.authorized_for);
  const audience = buildResendAudience(bundle, eligible);
  // Validate even a zero-size audience using a safe rendered fixture.
  for (const row of audience.recipients.length ? audience.recipients : [{email:'preview@example.invalid',first_name:''}]) {
    renderReminder(subject, bundle.campaign.dispatch.html_template, row, 'https://example.invalid/unsubscribe');
  }
  const digest = await fingerprint({ selection, subject, dispatch: bundle.campaign.dispatch, recipients: audience.recipients, total: audience.total, exclusions: audience.exclusions });
  return { ...audience, fingerprint: digest };
}

export function requireSamePreview(preview, current, now = Date.now()) {
  if (!preview || preview.expires_at <= now || preview.fingerprint !== current.fingerprint) stop('Audience, consent, or content changed, or preview expired. Review a new preview before sending.');
  if (!current.final_count) stop('No eligible recipients remain.');
}

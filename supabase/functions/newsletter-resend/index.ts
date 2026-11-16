import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createReminderHandler } from './handler.mjs';
import { loadReminder } from '../_shared/newsletter-resend-data.ts';
import { ResendSafetyError } from '../_shared/newsletter-resend.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, secret);
const encoder = new TextEncoder();
const signingKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const handler = createReminderHandler({
  authenticate: async (authorization: string) => {
    const { data, error } = await admin.auth.getUser((authorization || '').replace(/^Bearer /i, ''));
    return error ? null : data.user?.id;
  },
  load: (selection: any, subject: string) => loadReminder(admin, selection, subject),
  sign: async (payload: any) => {
    const text = encode(encoder.encode(JSON.stringify(payload)));
    return `${text}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(text))))}`;
  },
  verify: async (token: string) => {
    try {
      const [payload, signature, extra] = token.split('.');
      if (extra || !await crypto.subtle.verify('HMAC', signingKey, decode(signature), encoder.encode(payload))) return null;
      return JSON.parse(new TextDecoder().decode(decode(payload)));
    } catch { return null; }
  },
  enqueue: async ({ selection, subject, bundle, audience }: any) => {
    const { data, error } = await admin.rpc('enqueue_newsletter_reminder', {
      p_campaign_id: selection.campaignId, p_user_id: selection.userId, p_branch: selection.branch,
      p_subject: subject, p_source_version: bundle.source_version,
      p_recipients: audience.recipients, p_fingerprint: audience.fingerprint,
    });
    if (error || !data) throw new ResendSafetyError('Reminder could not be queued: already requested, source changed, or access denied. Refresh the campaign list and preview again.');
    return data;
  },
});
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response(null, { status:405, headers:cors });
  try {
    return new Response(JSON.stringify(await handler(await req.json(), req.headers.get('authorization'))), { headers:cors });
  } catch (error) {
    // Provider and database error bodies can contain addresses; never return/log them.
    return new Response(JSON.stringify({ error: error instanceof ResendSafetyError ? error.message : 'Reminder validation unavailable. Nothing was queued; try a new preview.' }), { status:409, headers:cors });
  }
});

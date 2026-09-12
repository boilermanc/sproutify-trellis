// Legacy endpoint retained for existing callers; only safe GET checks run here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { WEBHOOKS, probeWebhook } from '../_shared/system-health.mjs';

const HUB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const db = createClient(HUB_URL, SERVICE_KEY);
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data, error } = await db.auth.getUser(bearer);
    if (error || !data?.user) return json({ error: 'Not authenticated' }, 401);
    const operator = await db.from('trellis_users').select('status').eq('auth_user_id', data.user.id).maybeSingle();
    if (operator.error || operator.data?.status !== 'active') return json({ error: 'Active Trellis access required' }, 403);
    // Registration checks do not execute workflows or publish/send any payload.
    const results = await Promise.all(WEBHOOKS.map(w => probeWebhook(w)));
    const checked_at = new Date().toISOString();
    const saved = await db.from('webhook_health').upsert(results.map(({ path, label, status, http_code, detail }) =>
      ({ path, label, status, http_code, detail, checked_at })), { onConflict: 'path' });
    return json({ checked_at, cached: false, cache_saved: !saved.error, results });
  } catch { return json({ error: 'Webhook health unavailable' }, 503); }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { HEALTH_VERSION, WEBHOOKS, fetchEmailHealth, healthRows, probeWebhook, retryRead } from '../_shared/system-health.mjs';

const HUB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-health-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// This endpoint accepts no target URLs, queries, or repair commands from callers.
// The bot's separate secret permits only this fixed, read-only health report.
export async function authorized(req: Request, db: any) {
  const expected = Deno.env.get('TRELLIS_HEALTH_TOKEN');
  if (expected && req.headers.get('x-health-token') === expected) return true;
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!bearer) return false;
  const { data, error } = await db.auth.getUser(bearer);
  if (error || !data?.user) return false;
  const operator = await db.from('trellis_users').select('status').eq('auth_user_id', data.user.id).maybeSingle();
  return !operator.error && operator.data?.status === 'active';
}

async function checkSpoke(db: any, conn: any) {
  const base = { id: conn.id, name: conn.name, checked_at: new Date().toISOString() };
  const configured = typeof conn.tables === 'string' ? JSON.parse(conn.tables) : conn.tables;
  const tables = [...new Set((Array.isArray(configured) ? configured : [])
    .filter((table: any) => table.enabled === true && table.table_name).map((table: any) => table.table_name))];
  if (!tables.length) return { ...base, status: 'unknown', detail: 'No configured tables to verify. Review the spoke configuration.' };
  // Only the registered hosted Supabase origin receives its stored credential.
  let origin: string;
  try {
    const url = new URL(conn.supabase_url);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch { return { ...base, status: 'unknown', detail: 'Spoke URL requires review before an automated health check can run.' }; }
  const { data: key, error } = await db.rpc('get_spoke_connection_key', { p_connection_id: conn.id });
  if (error || !key) return { ...base, status: 'error', detail: 'Stored spoke credential could not be resolved. Review the connection in Branches.' };
  let retries = 0;
  for (const table of tables) {
    try {
      const { value: response, attempts } = await retryRead(() => fetch(
        `${origin}/rest/v1/${encodeURIComponent(String(table))}?select=*&limit=1`,
        { method: 'HEAD', redirect: 'manual', headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) },
      ));
      retries += attempts - 1;
      if (!response.ok) return { ...base, status: 'error', detail: `Configured table access returned HTTP ${response.status}. Review permissions and table mappings.`, attempts: attempts };
    } catch { return { ...base, status: 'error', detail: 'Configured table did not respond after two read-only checks.' }; }
  }
  return { ...base, status: 'ok', detail: `${tables.length} configured table${tables.length === 1 ? '' : 's'} reachable now${retries ? ' after retry' : ''}. This verifies access, not record freshness or completeness.`, retries };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const db = createClient(HUB_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  try {
    if (!await authorized(req, db)) return json({ error: 'Active Trellis access or a valid health token is required.' }, 403);
    const checked_at = new Date().toISOString();
    const errors: any[] = [];
    const [webhooks, email, connections] = await Promise.all([
      Promise.all(WEBHOOKS.map(w => probeWebhook(w))),
      fetchEmailHealth(db, checked_at).catch(() => null),
      db.from('spoke_connections').select('id,name,supabase_url,tables,status').eq('organization_id', ORG_ID).in('status', ['active', 'error']),
    ]);
    let spokes: any[] = [];
    if (connections.error) errors.push({ source: 'spokes', name: 'Spoke health check', detail: 'Connection inventory could not be loaded. No connection health was inferred.' });
    else {
      spokes = await Promise.all((connections.data || []).map(async conn => {
        try { return await checkSpoke(db, conn); }
        catch { return { id: conn.id, name: conn.name, status: 'unknown', checked_at, detail: 'Connection check could not finish. Review its configuration.' }; }
      }));
    }
    const report = { version: HEALTH_VERSION, checked_at, complete: !connections.error && email !== null && !spokes.some(s => s.status === 'unknown'), webhooks, spokes, email, errors };
    return json({ ...report, systems: healthRows(report) });
  } catch {
    return json({ error: 'System health could not complete. No healthy status was inferred.' }, 503);
  }
});

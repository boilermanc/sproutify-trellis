import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { summarize, validRequest } from './report.mjs';

const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {headers,status});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers});
  if (req.method !== 'POST') return reply({error:'POST required'},405);
  try {
    const hub = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply({error:'Sign in required'},401);
    const {data:{user}} = await hub.auth.getUser(token);
    if (!user) return reply({error:'Sign in required'},401);
    const {data:member,error:authError} = await hub.from('trellis_users').select('id')
      .eq('auth_user_id',user.id).eq('status','active').in('role',['admin','owner']).maybeSingle();
    if (authError) throw authError;
    if (!member) return reply({error:'An active Trellis administrator is required'},403);
    const input = await req.json().catch(() => null);
    if (!input || !validRequest(input)) return reply({error:'Invalid ad IDs or report dates'},400);
    const spoke = createClient('https://povudgtvzggnxwgtjexa.supabase.co',Deno.env.get('ATL_SPOKE_SERVICE_KEY')!);
    const orders = [];
    let cursor = '';
    const cutoff = new Date(Date.parse(input.end) + 2 * 86400000).toISOString();
    while (true) {
      let query = spoke.from('orders').select('id,created_at,guest_email,customers!orders_customer_id_fkey(email),marketing_attribution')
        .eq('payment_status','paid').not('status','in','(cancelled,refunded)').lt('created_at',cutoff).order('id').limit(500);
      if (cursor) query = query.gt('id',cursor);
      const {data,error} = await query;
      if (error) throw error;
      if (!data?.length) break;
      orders.push(...data);
      cursor = data[data.length-1].id;
    }
    orders.sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id));
    return reply(summarize(orders,input));
  } catch {
    return reply({error:'ATL order history is unavailable. Retry the report.'},503);
  }
});

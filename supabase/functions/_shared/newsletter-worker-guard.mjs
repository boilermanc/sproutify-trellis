const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-newsletter-worker-token', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Content-Type':'application/json' };
const response = (status,error) => new Response(error ? JSON.stringify({error}) : null,{status,headers});

export function newsletterWorkerMethod(req) {
  if (req.method==='OPTIONS') return response(204);
  if (req.method!=='POST') return response(405,'Method not allowed');
  return null;
}

export async function authorizeNewsletterWorker(req, { schedulerToken, authenticate, findStaff }) {
  const method=newsletterWorkerMethod(req);
  if (method) return method;
  const deny = () => response(403,'Newsletter worker authorization required');
  // Dedicated random token, never a public key or an unverified JWT claim.
  if (schedulerToken!==undefined && schedulerToken!=='') {
    if (typeof schedulerToken!=='string' || !/^[A-Za-z0-9_-]{43,128}$/.test(schedulerToken) || /^sb_/.test(schedulerToken)) {
      return response(503,'Newsletter scheduler authorization is not configured safely');
    }
  }
  // Separate from Authorization so gateway JWT verification can stay enabled.
  // A bad scheduler credential never falls back to a valid interactive session.
  const scheduler=req.headers.get('x-newsletter-worker-token');
  if (scheduler!==null) return schedulerToken && scheduler===schedulerToken ? null : deny();
  const match=/^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') || '');
  if (!match || match[1].length>8192) return deny();
  try {
    const user=await authenticate(match[1]);
    if (!user || user.role!=='authenticated' || typeof user.id!=='string' || !user.id) return deny();
    if (user.deleted_at || (user.banned_until && (!Number.isFinite(Date.parse(user.banned_until)) || Date.parse(user.banned_until)>Date.now()))) return deny();
    const staff=await findStaff(user.id);
    if (!staff || staff.auth_user_id!==user.id || staff.status!=='active' || !['owner','admin','operator'].includes(staff.role)) return deny();
    return null;
  } catch { return deny(); }
}

import { ResendSafetyError } from './newsletter-resend.mjs';
import { NEWSLETTER_CONSENT, newsletterBranchProject } from './newsletter-project-bindings.mjs';
export { NEWSLETTER_CONSENT } from './newsletter-project-bindings.mjs';

const fail = message => { throw new ResendSafetyError(message); };
const emailKey = email => String(email || '').trim().toLowerCase();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function consentPages(query, required) {
  const rows = [], seen = new Set();
  let offset=0,total;
  for (let page=0; page<200; page++) {
    const { data, error, count } = await query().range(offset,offset+999);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count<0) fail('Current newsletter consent data or exact count could not be verified. No reminder can be sent.');
    if (total===undefined) total=count;
    if (count!==total || total>50000 || offset+data.length>total || (data.length===0 && offset<total)) fail('Newsletter consent changed or pagination is incomplete. Review a new preview.');
    for (const row of data) {
      if (!object(row) || required.some(field => !Object.hasOwn(row,field)) || (row.email!==null && typeof row.email!=='string')) fail('Newsletter consent fields are missing or invalid. Verify this branch’s source schema.');
      const email = emailKey(row.email);
      // Empty identities cannot be recipients. Conflicting duplicate identities
      // must not be turned into consent by retaining only the positive record.
      if (!email) continue;
      if (seen.has(email)) fail('Newsletter consent identities are ambiguous. Reconcile duplicate addresses before previewing again.');
      seen.add(email); rows.push({...row,email});
    }
    offset+=data.length;
    // A short page may be the API's server-side row cap, not the end. Advance
    // by the actual page size and require the exact total before trusting it.
    if (offset===total) return rows;
  }
  fail('Newsletter consent pagination limit reached. Audience completeness could not be verified.');
}

export function privilegedConsentKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role === 'service_role'; }
  catch { return false; }
}

function hubAllowed(row, branch, requireBranchConsent) {
  // Global vetoes always win; true defaults alone cannot opt a Hub-native
  // identity into a particular branch.
  if (row.status!=='active' || row.is_subscribed!==true || row.marketing_pause!==false || !object(row.branch_consent)) return false;
  const entry = Object.hasOwn(row.branch_consent,branch) ? row.branch_consent[branch] : undefined;
  if (entry===undefined) return !requireBranchConsent;
  return object(entry) && entry.subscribed===true && entry.paused===false;
}

export function applyHubConsent(eligible, hubRows, branch, hubNative=false) {
  const byEmail = new Map(hubRows.map(row=>[emailKey(row.email),row]));
  return eligible.filter(row=>{
    const hub = byEmail.get(emailKey(row.email));
    if (hubNative) return !!hub && Array.isArray(hub.branches) && hub.branches.includes(branch) && hubAllowed(hub,branch,true);
    // A Hub record can veto a native opt-in, but cannot grant or resurrect it.
    return !hub || hubAllowed(hub,branch,false);
  });
}

export async function readBranchConsent(admin, branch, slug, createSpoke, atlKey, candidateEmails=null, bindings) {
  const contract = Object.hasOwn(NEWSLETTER_CONSENT,slug) ? NEWSLETTER_CONSENT[slug] : null;
  if (!contract || branch?.is_active!==true) fail('This branch has no verified newsletter consent contract or is inactive.');
  const expectedProject=newsletterBranchProject(bindings,slug);
  if (contract.kind==='blocked') fail(contract.reason);
  if (contract.kind==='hub' && branch.spoke_connection_id) fail('Hub-native newsletter consent does not match this branch’s configured source.');
  if (contract.kind!=='hub' && !branch.spoke_connection_id) fail('This branch’s newsletter consent connection is missing.');

  let eligible;
  if (contract.kind!=='hub') {
    const {data:conn,error} = await admin.from('spoke_connections').select('supabase_url,status').eq('id',branch.spoke_connection_id).single();
    if (error || conn?.status!=='active' || ![`https://${expectedProject}.supabase.co`,`https://${expectedProject}.supabase.co/`].includes(conn.supabase_url)) fail('Newsletter consent connection does not match this business.');
    let key = atlKey;
    if (contract.kind!=='atl') {
      const result = await admin.rpc('get_spoke_connection_key',{p_connection_id:branch.spoke_connection_id});
      if (result.error || !privilegedConsentKey(result.data)) fail('Newsletter consent requires the branch’s configured server-only service credential.');
      key = result.data;
    }
    if (!key) fail('Server newsletter consent access is not configured.');
    const spoke = createSpoke(conn.supabase_url,key);
    if (contract.kind==='atl') {
      eligible = await consentPages(()=>spoke.rpc('resolve_newsletter_audience',{p_tags:null},{count:'exact'}).order('email'),['email']);
    } else if (contract.kind==='marketing-rpc') {
      // Prepared source migrations default to opted out and expose this fixed,
      // service-only read contract. An unapplied/missing RPC is an error, never
      // a reason to fall back to operational alerts, billing, or Hub opt-ins.
      eligible = await consentPages(()=>spoke.rpc('resolve_marketing_audience',{}, {count:'exact'}).order('id'),['id','email']);
    } else {
      const fields = ['id','email',...(contract.fields || [])];
      const rows = await consentPages(()=>spoke.from(contract.table).select(fields.join(','),{count:'exact'}).order('id'),fields);
      if (contract.kind==='home') {
        eligible=[];
        const candidates = candidateEmails && new Set(candidateEmails.map(emailKey));
        const selected=rows.filter(row=>!candidates || candidates.has(row.email));
        // Bound Auth concurrency; a large original must not cause an unbounded
        // request burst or serialize thousands of remote Auth reads.
        for (let offset=0; offset<selected.length; offset+=8) {
          const decisions=await Promise.all(selected.slice(offset,offset+8).map(async row=>{
            const {data,error:authError} = await spoke.auth.admin.getUserById(row.id);
            const user=data?.user;
            if (authError || !user || user.id!==row.id || emailKey(user.email)!==row.email) fail('Sproutify Home marketing preference identity or Auth data could not be verified.');
            if (user.deleted_at || (user.banned_until && (!Number.isFinite(Date.parse(user.banned_until)) || Date.parse(user.banned_until)>Date.now()))) return null;
            // This is a communication preference, never an authorization claim.
            // Do not inherit the UI's default-true display setting.
            return user.user_metadata?.notification_prefs?.marketingEmails===true ? row : null;
          }));
          eligible.push(...decisions.filter(Boolean));
        }
      } else eligible=rows.filter(row=>contract.fields.some(field=>row[field]===true));
    }
  }
  const hubRows = await consentPages(()=>admin.from('profiles')
    .select('id,email,branches,is_subscribed,marketing_pause,status,branch_consent',{count:'exact'}).order('id'),
    ['id','email','branches','is_subscribed','marketing_pause','status','branch_consent']);
  return applyHubConsent(contract.kind==='hub' ? hubRows : eligible,hubRows,slug,contract.kind==='hub');
}

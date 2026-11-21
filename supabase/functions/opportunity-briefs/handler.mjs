import { BriefError, briefPermissions, buildSavedBrief, buildApprovedBrief } from './policy.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function result(query) {
  const { data, error } = await query;
  if (error) {
    if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) throw new BriefError('Shared brief storage is not installed yet.', 503, 'unavailable');
    if (['40001', '23505'].includes(error.code)) throw new BriefError('This brief changed. Reload before saving.', 409, 'conflict');
    throw new BriefError('Brief storage could not finish this request.', 500, 'storage_error');
  }
  return data;
}

export function createBriefHandler({ authenticate, createDatabase, now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }) {
return async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.', code: 'method_not_allowed' }, 405);
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) throw new BriefError('Sign in to manage brand briefs.', 401, 'unauthenticated');
    const { data: authData, error: authError } = await authenticate(authorization);
    if (authError || !authData.user) throw new BriefError('Sign in to manage brand briefs.', 401, 'unauthenticated');
    const raw = await req.text();
    if (raw.length > 150000) throw new BriefError('The brief request is too large.', 413, 'too_large');
    let body;
    try { body = JSON.parse(raw); } catch { throw new BriefError('Invalid JSON request.'); }
    if (!body || !['list', 'save', 'approve'].includes(body.action) || typeof body.project_id !== 'string' || !body.project_id.trim()) throw new BriefError('A valid action and project are required.');
    const db = createDatabase();
    const operator = await result(db.from('trellis_users').select('id,role,status').eq('auth_user_id', authData.user.id).maybeSingle());
    if (!operator || operator.status !== 'active') throw new BriefError('Active Trellis access is required.', 403, 'forbidden');
    const branch = await result(db.from('branches').select('id,slug').eq('slug', body.project_id).eq('is_active', true).maybeSingle());
    if (!branch) throw new BriefError('Unknown project.', 404, 'not_found');
    const assignment = await result(db.from('trellis_user_branches').select('trellis_user_id,branch_id,branch_role').eq('trellis_user_id', operator.id).eq('branch_id', branch.id).maybeSingle());
    const permissions = briefPermissions(operator, assignment, branch.id);
    if (!permissions.can_read) throw new BriefError('You do not have access to this brand.', 403, 'forbidden');
    const brands = await result(db.from('marketing_brands').select('id,name').eq('branch_id', branch.id).order('name'));
    if (body.brand_id !== undefined && !uuid(body.brand_id)) throw new BriefError('A valid brand identifier is required.');
    const selected = body.brand_id ? brands.find((brand) => brand.id === body.brand_id) : brands.length === 1 ? brands[0] : null;
    if (body.brand_id && !selected) throw new BriefError('Brand does not belong to this project.', 403, 'scope_mismatch');
    const scope = selected ? { project_id: branch.slug, branch_id: branch.id, brand_id: selected.id } : null;
    if (body.action === 'list') {
      const versions = selected ? await result(db.from('opportunity_brief_versions').select('brief').eq('brand_id', selected.id).eq('branch_id', branch.id).eq('project_id', branch.slug).order('version', { ascending: false }).limit(100)) : [];
      return json({ scope, brands, versions, current: versions[0]?.brief || null, can_manage: permissions.can_manage, can_approve: permissions.can_approve });
    }
    if (!selected || !uuid(body.brand_id)) throw new BriefError('Select an existing brand profile before saving.');
    if (!permissions.can_manage || (body.action === 'approve' && !permissions.can_approve)) throw new BriefError('You do not have permission for this action.', 403, 'forbidden');
    if (!(body.expected_version_id === null || uuid(body.expected_version_id))) throw new BriefError('The expected version is required.');
    const latest = await result(db.from('opportunity_brief_versions').select('brief').eq('brand_id', selected.id).eq('branch_id', branch.id).eq('project_id', branch.slug).order('version', { ascending: false }).limit(1).maybeSingle());
    const previous = latest?.brief || null;
    if ((previous?.version_id || null) !== body.expected_version_id) throw new BriefError('This brief changed. Reload before saving.', 409, 'conflict');
    const args = { previous, scope, actorId: authData.user.id, now: now(), newId };
    const brief = body.action === 'save' ? buildSavedBrief({ ...args, input: body.brief }) : buildApprovedBrief({ ...args, confirmedFactIds: body.confirmed_fact_ids });
    const saved = await result(db.rpc('append_opportunity_brief', { p_brief: brief, p_expected_version_id: body.expected_version_id }));
    return json({ brief: saved });
  } catch (error) {
    if (error instanceof BriefError) return json({ error: error.message, code: error.code, issues: error.issues }, error.status);
    return json({ error: 'Unable to process the brief request.', code: 'internal_error' }, 500);
  }
};
}

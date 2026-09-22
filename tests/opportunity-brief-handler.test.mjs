import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefHandler } from '../supabase/functions/opportunity-briefs/handler.mjs';
import { makeBrief, NOW } from './fixtures/opportunity-brief.mjs';

const brandId = '10000000-0000-4000-8000-000000000001';
const branchId = '20000000-0000-4000-8000-000000000001';
const actorId = '30000000-0000-4000-8000-000000000001';
const versionId = '40000000-0000-4000-8000-000000000001';
function setup(options = {}) {
  const queries = []; const writes = []; let dbCreations = 0; let authCalls = 0;
  const tables = {
    trellis_users: [{ id: 'operator-id', auth_user_id: actorId, role: 'operator', status: 'active' }],
    branches: [{ id: branchId, slug: 'nursery-project', is_active: true }],
    trellis_user_branches: [{ trellis_user_id: 'operator-id', branch_id: branchId, branch_role: 'lead' }],
    marketing_brands: [{ id: brandId, branch_id: branchId, name: 'Fictional nursery' }],
    opportunity_brief_versions: [], ...options.tables,
  };
  const db = {
    from(table) {
      const call = { table, filters: [] }; queries.push(call); let single = false; let limit = Infinity;
      const query = {
        select() { return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order() { return query; },
        limit(value) { limit = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          if (options.missingStorage && table === 'opportunity_brief_versions') return Promise.resolve({ data: null, error: { code: '42P01' } }).then(resolve, reject);
          const rows = tables[table].filter(row => call.filters.every(([key, value]) => row[key] === value)).slice(0, limit);
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      writes.push({ name, args });
      return options.rpcConflict ? { data: null, error: { code: '40001' } } : { data: args.p_brief, error: null };
    },
  };
  const handler = createBriefHandler({
    async authenticate(authorization) {
      authCalls++; assert.equal(authorization, 'Bearer session-jwt');
      return options.invalidAuth ? { data: { user: null }, error: new Error('invalid') } : { data: { user: { id: actorId } }, error: null };
    },
    createDatabase() { dbCreations++; return db; }, now: () => NOW, newId: () => crypto.randomUUID(),
  });
  async function send(body = {}, headers = { Authorization: 'Bearer session-jwt' }) {
    const response = await handler(new Request('https://example.test/opportunity-briefs', { method: 'POST', headers, body: JSON.stringify({ action: 'list', project_id: 'nursery-project', ...body }) }));
    return { status: response.status, body: await response.json() };
  }
  return { send, queries, writes, counts: () => ({ dbCreations, authCalls }) };
}
const save = () => ({ action: 'save', brand_id: brandId, expected_version_id: null, brief: makeBrief() });

test('missing JWT performs neither authentication nor privileged queries', async () => {
  const env = setup(); assert.equal((await env.send({}, {})).status, 401);
  assert.deepEqual(env.counts(), { dbCreations: 0, authCalls: 0 }); assert.equal(env.queries.length, 0);
});
test('invalid JWT never creates the privileged database client', async () => {
  const env = setup({ invalidAuth: true }); assert.equal((await env.send()).status, 401);
  assert.deepEqual(env.counts(), { dbCreations: 0, authCalls: 1 }); assert.equal(env.queries.length, 0);
});
test('inactive user denied before branch or brief reads', async () => {
  const env = setup({ tables: { trellis_users: [{ id: 'operator-id', auth_user_id: actorId, role: 'owner', status: 'inactive' }] } });
  assert.equal((await env.send()).status, 403); assert.deepEqual(env.queries.map(q => q.table), ['trellis_users']);
});
test('unassigned operator denied before brand or brief reads', async () => {
  const env = setup({ tables: { trellis_user_branches: [] } }); assert.equal((await env.send()).status, 403);
  assert.ok(!env.queries.some(q => ['marketing_brands', 'opportunity_brief_versions'].includes(q.table)));
});
test('inactive branch excluded and list is a scoped read with no writes', async () => {
  const inactive = setup({ tables: { branches: [{ id: branchId, slug: 'nursery-project', is_active: false }] } });
  assert.equal((await inactive.send()).status, 404);
  const env = setup(); const response = await env.send(); assert.equal(response.status, 200);
  assert.deepEqual(response.body.scope, { brand_id: brandId, branch_id: branchId, project_id: 'nursery-project' });
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.queries.find(q => q.table === 'opportunity_brief_versions').filters, [['brand_id', brandId], ['branch_id', branchId], ['project_id', 'nursery-project']]);
});
test('foreign brand cannot be read or saved under this project', async () => {
  const env = setup(); const response = await env.send({ ...save(), brand_id: '10000000-0000-4000-8000-000000000099' });
  assert.equal(response.status, 403); assert.equal(response.body.code, 'scope_mismatch'); assert.equal(env.writes.length, 0);
  assert.ok(!env.queries.some(q => q.table === 'opportunity_brief_versions'));
});
test('stale expected predecessor rejected without writing', async () => {
  const env = setup(); const response = await env.send({ ...save(), expected_version_id: versionId });
  assert.equal(response.status, 409); assert.equal(response.body.code, 'conflict'); assert.equal(env.writes.length, 0);
});
test('missing schema is a visible unavailable state not a healthy empty list', async () => {
  const env = setup({ missingStorage: true }); const response = await env.send();
  assert.equal(response.status, 503); assert.equal(response.body.code, 'unavailable'); assert.equal(env.writes.length, 0);
});
test('save ignores forged actor scope status and version; sends trusted metadata to RPC', async () => {
  const env = setup(); const response = await env.send(save()); assert.equal(response.status, 200);
  const brief = response.body.brief;
  assert.equal(brief.author_id, actorId); assert.equal(brief.branch_id, branchId); assert.equal(brief.brand_id, brandId);
  assert.equal(brief.created_at, NOW); assert.equal(brief.status, 'draft'); assert.equal(brief.reviewer_id, null);
  assert.equal(brief.version, 1); assert.equal(brief.approved_at, null); assert.equal(brief.facts[0].status, 'proposed');
  assert.equal(env.writes[0].name, 'append_opportunity_brief'); assert.equal(env.writes[0].args.p_expected_version_id, null);
});
test('race detected by transactional RPC maps to409', async () => {
  const env = setup({ rpcConflict: true }); const response = await env.send(save());
  assert.equal(response.status, 409); assert.equal(response.body.code, 'conflict');
});
test('assigned viewer cannot write; operator member cannot approve', async () => {
  const viewer = setup({ tables: { trellis_users: [{ id: 'operator-id', auth_user_id: actorId, role: 'viewer', status: 'active' }] } });
  assert.equal((await viewer.send(save())).status, 403); assert.equal(viewer.writes.length, 0);
  const member = setup({ tables: { trellis_user_branches: [{ trellis_user_id: 'operator-id', branch_id: branchId, branch_role: 'member' }] } });
  assert.equal((await member.send({ action: 'approve', brand_id: brandId, expected_version_id: versionId, confirmed_fact_ids: [] })).status, 403);
  assert.equal(member.writes.length, 0);
});
test('approval reads persisted draft and ignores browser replacement content', async () => {
  const previous = { ...makeBrief(), brand_id: brandId, branch_id: branchId, project_id: 'nursery-project',
    version_id: versionId, status: 'draft', reviewer_id: null, approved_at: null };
  previous.facts = previous.facts.map(fact => ({ ...fact, status: 'proposed', reviewer_id: null, approved_at: null }));
  const env = setup({ tables: { opportunity_brief_versions: [{ brand_id: brandId, branch_id: branchId, project_id: 'nursery-project', brief: previous }] } });
  const response = await env.send({ action: 'approve', brand_id: brandId, expected_version_id: versionId,
    confirmed_fact_ids: [previous.facts[0].id], reviewer_id: 'forged-reviewer', brief: { facts: [{ claim: 'Forged claim' }] } });
  assert.equal(response.status, 200); assert.equal(response.body.brief.version, 2);
  assert.equal(response.body.brief.reviewer_id, actorId); assert.equal(response.body.brief.approved_at, NOW);
  assert.equal(response.body.brief.facts[0].claim, previous.facts[0].claim);
  assert.equal(response.body.brief.facts[0].reviewer_id, actorId);
  assert.equal(env.writes[0].args.p_expected_version_id, versionId);
});

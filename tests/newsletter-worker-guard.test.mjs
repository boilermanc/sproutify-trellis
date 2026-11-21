import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeNewsletterWorker } from '../supabase/functions/_shared/newsletter-worker-guard.mjs';
import {workerToken} from './helpers/newsletter-bindings.mjs';
const request=(token,method='POST',scheduler=false)=>new Request('https://fixture.invalid',{method,headers:token?(scheduler?{'x-newsletter-worker-token':token,authorization:'Bearer gateway-fixture'}:{authorization:`Bearer ${token}`}):{}});
const fixture=()=>({schedulerToken:workerToken,authenticate:async()=>null,findStaff:async()=>null});
test('only an exact configured dedicated scheduler token bypasses interactive Auth',async()=>{
  const deps=fixture();deps.authenticate=deps.findStaff=()=>{throw Error('No network allowed');};
  assert.equal(await authorizeNewsletterWorker(request(workerToken,'POST',true),deps),null);
  for(const token of [undefined,'sb_publishable_fixture','sb_secret_fixture','service-key','eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',workerToken+'x'])assert.equal((await authorizeNewsletterWorker(request(token,'POST',true),deps)).status,403);
  assert.equal((await authorizeNewsletterWorker(request(workerToken),deps)).status,403); // Never a bearer shortcut.
});
test('missing scheduler config grants no scheduler fallback; malformed config is unavailable',async()=>{
  for(const schedulerToken of [undefined,''])assert.equal((await authorizeNewsletterWorker(request(workerToken,'POST',true),{...fixture(),schedulerToken})).status,403);
  for(const schedulerToken of ['short','sb_publishable_'+'x'.repeat(43),'sb_secret_'+'x'.repeat(43),'x'.repeat(129)])assert.equal((await authorizeNewsletterWorker(request(workerToken),{...fixture(),schedulerToken})).status,503);
});
test('only verified active Trellis owner/admin/operator identities can invoke interactively',async()=>{
  for(const role of ['owner','admin','operator','staff','viewer','client',undefined]) {
    const deps={...fixture(),authenticate:async()=>({id:'a',role:'authenticated'}),findStaff:async id=>({auth_user_id:id,status:'active',role})};
    assert.equal((await authorizeNewsletterWorker(request('session-token'),deps))?.status ?? null,['owner','admin','operator'].includes(role)?null:403);
  }
  for(const staff of [null,{auth_user_id:'other',status:'active',role:'owner'},{auth_user_id:'a',status:'inactive',role:'owner'}])assert.equal((await authorizeNewsletterWorker(request('session-token'),{...fixture(),authenticate:async()=>({id:'a',role:'authenticated'}),findStaff:async()=>staff})).status,403);
});
test('client/anonymous identities, stale role hints and Auth/staff failures never authorize',async()=>{
  for(const user of [null,{id:'a',role:'anon'},{id:'a',role:'sw_portal_client'},{id:'',role:'authenticated'}])assert.equal((await authorizeNewsletterWorker(request('session-token'),{...fixture(),authenticate:async()=>user,findStaff:async()=>{throw Error('Must not read staff');}})).status,403);
  for(const failing of ['authenticate','findStaff']) {
    const deps={...fixture(),authenticate:async()=>({id:'a',role:'authenticated'}),findStaff:async()=>({auth_user_id:'a',role:'owner',status:'active'})};
    deps[failing]=async()=>{throw Error('sensitive backend failure');};
    const result=await authorizeNewsletterWorker(request('session-token'),deps);assert.equal(result.status,403);assert.ok(!(await result.text()).includes('sensitive'));
  }
});
test('disabled Auth accounts and invalid scheduler headers cannot fall back to operator access',async()=>{
  const deps={...fixture(),authenticate:async()=>({id:'a',role:'authenticated'}),findStaff:async()=>({auth_user_id:'a',role:'owner',status:'active'})};
  assert.equal((await authorizeNewsletterWorker(request('wrong-scheduler','POST',true),deps)).status,403);
  for(const status of [{deleted_at:'2026-01-01'},{banned_until:'2999-01-01'},{banned_until:'invalid'}])assert.equal((await authorizeNewsletterWorker(request('session-token'),{...deps,authenticate:async()=>({id:'a',role:'authenticated',...status})})).status,403);
  assert.equal(await authorizeNewsletterWorker(request('session-token'),{...deps,schedulerToken:undefined}),null);
});
test('preflight and methods terminate before Auth; malformed authorization is rejected',async()=>{
  const deps=fixture();deps.authenticate=()=>{throw Error('unexpected Auth call');};
  assert.equal((await authorizeNewsletterWorker(request(undefined,'OPTIONS'),deps)).status,204);
  for(const method of ['GET','DELETE','PUT'])assert.equal((await authorizeNewsletterWorker(request(workerToken,method),deps)).status,405);
  for(const value of ['Basic token','Bearer','Bearer a b','Bearer '+ 'x'.repeat(8193)])assert.equal((await authorizeNewsletterWorker(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:value}}),deps)).status,403);
});

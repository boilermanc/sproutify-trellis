// Real endpoint initialization, signing and HTTP wrapper; no SDK or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {stagingManifest,productionManifest} from './helpers/newsletter-bindings.mjs';
const bindingsUrl=new URL('../supabase/functions/_shared/newsletter-project-bindings.mjs',import.meta.url).href;
const handlerUrl=new URL('../supabase/functions/newsletter-resend/handler.mjs',import.meta.url).href;
const safetyUrl=new URL('../supabase/functions/_shared/newsletter-resend.mjs',import.meta.url).href;
const source=fs.readFileSync(new URL('../supabase/functions/newsletter-resend/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
let version=0;
async function setup(overrides={}) {
  const env={SUPABASE_URL:`https://${stagingManifest.hub}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:'fixture-signing-key',NEWSLETTER_ENVIRONMENT:'staging',NEWSLETTER_PROJECT_BINDINGS:JSON.stringify(stagingManifest),...overrides};
  const state={clients:0,auth:0,loads:0,enqueues:0};let serve;
  state.admin={auth:{getUser:async()=>{state.auth++;return {data:{user:{id:'owner'}}};}},rpc:async()=>{state.enqueues++;throw Error('Preview must not queue');}};
  state.load=async(_admin,selection,_subject,_create,_key,bindings)=>{
    state.loads++;state.bindings=bindings;state.selection=selection;
    return {bundle:{campaign:{id:selection.campaignId,name:'Fixture',subject:'Original'}},audience:{fingerprint:'fixture-hash',total:1,exclusions:{},final_count:1,recipients:[{source_recipient_id:'synthetic-row'}]}};
  };
  globalThis.__endpointFixture=state;globalThis.Deno={env:{get:name=>env[name]},serve:callback=>{serve=callback;}};
  const wrapped=`import {readNewsletterProjectBindings} from ${JSON.stringify(bindingsUrl)};import {createReminderHandler} from ${JSON.stringify(handlerUrl)};import {ResendSafetyError} from ${JSON.stringify(safetyUrl)};
    const createClient=()=>{globalThis.__endpointFixture.clients++;return globalThis.__endpointFixture.admin;};
    const loadReminder=(...args)=>globalThis.__endpointFixture.load(...args);\n`+source+`\n// fixture instance ${version++}`;
  await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(wrapped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
  state.request=body=>serve(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture-user'},body:JSON.stringify(body)}));
  return state;
}
test('missing/invalid endpoint config gives a clear 503 before any SDK, Auth or original read',async()=>{
  for(const overrides of [{NEWSLETTER_ENVIRONMENT:undefined},{NEWSLETTER_PROJECT_BINDINGS:undefined},{SUPABASE_URL:`https://${productionManifest.hub}.supabase.co`}]) {
    const s=await setup(overrides),result=await s.request({action:'preview'});
    assert.equal(result.status,503);assert.match((await result.json()).error,/configuration|bindings/);
    assert.equal(s.clients,0);assert.equal(s.auth,0);assert.equal(s.loads,0);assert.equal(s.enqueues,0);
  }
});
test('valid staging preview uses only server bindings; request environment/project hints cannot override them',async()=>{
  const s=await setup();const result=await s.request({action:'preview',campaign_id:'11111111-1111-4111-a111-111111111111',branch:'lanewise',subject:'Reminder',environment:'production',project_bindings:productionManifest});
  assert.equal(result.status,200);const body=await result.json();assert.ok(body.preview.token);
  assert.deepEqual(s.bindings.branches,stagingManifest.branches);assert.equal(s.bindings.environment,'staging');
  assert.equal(s.auth,1);assert.equal(s.loads,1);assert.equal(s.enqueues,0);
});

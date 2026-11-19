// Executes the actual worker with an in-memory SDK and mocked provider fetch.
// No Deno server, remote database or external network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { prepareReminder } from '../supabase/functions/_shared/newsletter-resend.mjs';
import {productionManifest,stagingManifest,workerToken} from './helpers/newsletter-bindings.mjs';
const id='579edbfb-33eb-439a-bee8-a8be1006137e';
const original={id,owner_id:'owner',branches:['atlurbanfarms'],name:'Original',send_status:'sent',dispatch:{html_template:'<p>Hello {{first_name}}</p>{{unsubscribe_url}}',from:'Test <test@example.invalid>'}};
const recipient={id:'recipient-uuid',email:'a@example.invalid',first_name:'A',unsubscribe_token:'fixture',status:'pending',campaign_id:'reminder-id'};
const fixture=()=>({campaign:structuredClone(original),recipients:[{...recipient,status:'sent',campaign_id:id}],sends:[{campaign_id:id,email:recipient.email,resend_email_id:'original-provider-id'}],events:[{campaign_id:id,email:recipient.email,resend_email_id:'original-provider-id',event_type:'delivered'}],suppressions:[]});
const moduleUrl=new URL('../supabase/functions/_shared/newsletter-resend.mjs',import.meta.url).href;
const guardUrl=new URL('../supabase/functions/_shared/newsletter-worker-guard.mjs',import.meta.url).href;
const bindingsUrl=new URL('../supabase/functions/_shared/newsletter-project-bindings.mjs',import.meta.url).href;
const worker=fs.readFileSync(new URL('../supabase/functions/campaign-sender/index.ts',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('const RATE_LIMIT_MS = 550','const RATE_LIMIT_MS = 0');
const source=`import {renderReminder,validateRendered,ResendSafetyError} from ${JSON.stringify(moduleUrl)};
  import {authorizeNewsletterWorker,newsletterWorkerMethod} from ${JSON.stringify(guardUrl)};import {readNewsletterProjectBindings,newsletterBranchProject,newsletterDispatchAllowed} from ${JSON.stringify(bindingsUrl)};const loadReminder=(...args)=>globalThis.__workerFixture.load(...args);const readBranchConsent=(...args)=>globalThis.__workerFixture.readAtl(...args);
  const createClient=()=>{globalThis.__workerFixture.clientCount++;return globalThis.__workerFixture.admin;};\n`+worker;
let handler;
const defaultEnv=()=>({SUPABASE_URL:`https://${productionManifest.hub}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:'fixture-runtime-key',NEWSLETTER_ENVIRONMENT:'production',NEWSLETTER_PROJECT_BINDINGS:JSON.stringify(productionManifest),NEWSLETTER_WORKER_TOKEN:workerToken,NEWSLETTER_DISPATCH_ENABLED:'true'});
let env=defaultEnv();
globalThis.Deno={env:{get:name=>env[name]},serve:callback=>{handler=callback;}};
await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));

async function setup() {
  env=defaultEnv();
  const bundle=fixture();const audience=await prepareReminder(bundle,[recipient],{campaignId:id,userId:'owner',branch:'atlurbanfarms'},'Reminder');
  const campaign={...structuredClone(original),id:'reminder-id',subject:'Reminder',send_status:'queued',created_at:new Date().toISOString(),dispatch:{...original.dispatch,subject:'Reminder'},metadata:{resend_of:id,resend_safety_version:1,resend_fingerprint:audience.fingerprint}};
  const tables={campaigns:[campaign],campaign_recipients:[structuredClone(recipient)],campaign_sends:[],email_suppressions:[],tenant_secrets:[{resend_token:'fixture-provider-token'}],trellis_users:[],branches:[{slug:'atlurbanfarms',spoke_connection_id:'atl-connection',is_active:true}]};
  const state={tables,campaign,bundle,loadCount:0,atlReadCount:0,liveAudience:[{email:recipient.email,first_name:'Live A'}],fetchCount:0,clientCount:0,tableReads:[],authReads:0,authUser:null,suppressionFailure:false,attributionFailure:false,providerFailure:false,claimed:false,providerRequests:[],providerCache:new Map()};
  const admin={auth:{getUser:async()=>{state.authReads++;return {data:{user:state.authUser},error:null};}},rpc:async name=>{assert.equal(name,'claim_due_campaign');if(state.claimed)return {data:null};state.claimed=true;return {data:structuredClone(campaign)};},from:table=>{
    state.tableReads.push(table);
    let predicates=[],update=null,upsert=null,count=false,single=false;
    const q={select:(_fields,options)=>{count=options?.count==='exact';return q;},eq:(field,value)=>{predicates.push(row=>row[field]===value);return q;},in:(field,values)=>{predicates.push(row=>values.includes(row[field]));return q;},order:()=>q,limit:()=>q,update:values=>{update=values;return q;},upsert:values=>{upsert=values;return q;},single:()=>{single=true;return q;},maybeSingle:()=>{single=true;return q;},
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        if(table==='email_suppressions'&&state.suppressionFailure)return {error:{message:'fixture outage'}};
        if(upsert){if(state.attributionFailure)return {error:{message:'fixture outage'}};for(const row of upsert)if(!tables[table].some(r=>r.resend_email_id===row.resend_email_id))tables[table].push(row);return {error:null};}
        const rows=tables[table].filter(row=>predicates.every(predicate=>predicate(row)));if(update)rows.forEach(row=>Object.assign(row,update));
        return {data:single||['tenant_secrets','trellis_users'].includes(table)?structuredClone(rows[0]):structuredClone(rows),count:count?rows.length:undefined,error:null};
      }).then(resolve,reject)};return q;}};
  state.admin=admin;state.load=async()=>{state.loadCount++;return {bundle,audience:await prepareReminder(bundle,[recipient],{campaignId:id,userId:'owner',branch:'atlurbanfarms'},'Reminder')};};
  state.readAtl=async()=>{state.atlReadCount++;return structuredClone(state.liveAudience);};
  globalThis.__workerFixture=state;
  globalThis.fetch=async(url,options)=>{
    state.fetchCount++;const reminderRequest=url==='https://api.resend.com/emails';assert.equal(url,reminderRequest?'https://api.resend.com/emails':'https://api.resend.com/emails/batch');const key=options.headers['Idempotency-Key'];if(reminderRequest)assert.equal(key,'newsletter-reminder/reminder-id/recipient-uuid');
    const body=JSON.parse(options.body);const message=reminderRequest?body:body[0];assert.equal(message.to[0],recipient.email);assert.ok(!message.html.includes('{{'));assert.ok(message.headers['List-Unsubscribe']);
    state.providerRequests.push({key,body});
    if(state.providerFailure)return new Response('{}',{status:503});
    if(!reminderRequest)return new Response(JSON.stringify({data:[{id:'fixture-standard-provider-result'}]}),{status:200});
    if(!state.providerCache.has(key))state.providerCache.set(key,{id:'fixture-provider-result'});
    return new Response(JSON.stringify(state.providerCache.get(key)),{status:200});
  };
  state.run=async(token=workerToken,method='POST',scheduler=token===workerToken)=>{state.claimed=false;return handler(new Request('https://fixture.invalid',{method,headers:token?(scheduler?{'x-newsletter-worker-token':token,authorization:'Bearer gateway-fixture'}:{authorization:`Bearer ${token}`}):{}}));};return state;
}
test('worker dispatches valid reminder and persists provider campaign attribution',async()=>{
  const s=await setup();await s.run();assert.equal(s.fetchCount,1);assert.equal(s.tables.campaign_recipients[0].status,'sent');assert.equal(s.tables.campaign_sends[0].campaign_id,'reminder-id');assert.equal(s.campaign.send_status,'sent');
});
test('ordinary ATL campaign revalidates the live audience immediately before dispatch',async()=>{
  const s=await setup();s.campaign.metadata={};s.campaign.subject='Standard ATL campaign';s.campaign.dispatch.subject=s.campaign.subject;
  await s.run();
  assert.equal(s.atlReadCount,1);assert.equal(s.fetchCount,1);assert.equal(s.tables.campaign_recipients[0].status,'sent');assert.equal(s.tables.campaign_sends[0].campaign_id,s.campaign.id);assert.equal(s.campaign.send_status,'sent');
  assert.match(s.providerRequests[0].body[0].html,/Live A/);
});
test('ordinary ATL campaign records a non-delivery when a staged candidate is absent from the live audience',async()=>{
  const s=await setup();s.campaign.metadata={};s.liveAudience=[];
  await s.run();
  assert.equal(s.atlReadCount,1);assert.equal(s.fetchCount,0);assert.equal(s.tables.campaign_recipients[0].status,'failed');assert.match(s.tables.campaign_recipients[0].error,/live ATL newsletter audience/);assert.equal(s.campaign.send_status,'failed');
});
test('ordinary ATL campaign fails closed when live audience verification is unavailable',async()=>{
  const s=await setup();s.campaign.metadata={};s.readAtl=async()=>{s.atlReadCount++;throw Error('fixture outage');};
  await s.run();
  assert.equal(s.atlReadCount,1);assert.equal(s.fetchCount,0);assert.equal(s.tables.campaign_recipients[0].status,'pending');assert.equal(s.campaign.send_status,'failed');assert.match(s.campaign.send_error,/could not be verified/);
});
test('mixed ATL email campaign cannot bypass branch-safe live revalidation',async()=>{
  const s=await setup();s.campaign.metadata={};s.campaign.branches=['atlurbanfarms','rejoice'];
  await s.run();
  assert.equal(s.atlReadCount,0);assert.equal(s.fetchCount,0);assert.equal(s.campaign.send_status,'failed');assert.match(s.campaign.send_error,/target ATL only/);
});
test('crash after provider acceptance retries identical per-recipient key and payload',async()=>{
  const s=await setup();s.attributionFailure=true;await s.run();assert.equal(s.campaign.send_status,'failed');assert.equal(s.tables.campaign_recipients[0].status,'pending');
  s.attributionFailure=false;await s.run();assert.equal(s.fetchCount,2);assert.equal(s.providerCache.size,1);assert.deepEqual(s.providerRequests[0],s.providerRequests[1]);assert.equal(s.tables.campaign_sends.length,1);
});
for(const reason of ['consent','suppression','missing-events','placeholder','expired-retry','invalid-created-at','legacy']) test(`worker sends nothing when ${reason} validation fails`,async()=>{
  const s=await setup();
  if(reason==='consent')s.load=async()=>{throw Error('consent unavailable');};
  if(reason==='suppression')s.suppressionFailure=true;
  if(reason==='missing-events')s.bundle.events=[];
  if(reason==='placeholder')s.campaign.dispatch.html_template='<p>[DATE]</p>';
  if(reason==='expired-retry')s.campaign.created_at=new Date(Date.now()-24*60*60*1000).toISOString();
  if(reason==='invalid-created-at')s.campaign.created_at=null;
  if(reason==='legacy')delete s.campaign.metadata.resend_safety_version;
  await s.run();assert.equal(s.fetchCount,0);assert.equal(s.campaign.send_status,'failed');
});
test('worker stops on new original-campaign open after preview',async()=>{
  const s=await setup();s.bundle.events.push({...s.bundle.events[0],event_type:'opened'});await s.run();assert.equal(s.fetchCount,0);assert.equal(s.campaign.send_status,'failed');
});
test('provider error and missing provider message ID cannot mark a reminder sent',async()=>{
  for(const failure of ['error','missing-id']) {
    const s=await setup();
    if(failure==='error')s.providerFailure=true;
    else s.providerCache.set('newsletter-reminder/reminder-id/recipient-uuid',{});
    await s.run();assert.equal(s.fetchCount,1);assert.equal(s.campaign.send_status,'failed');assert.equal(s.tables.campaign_recipients[0].status,'pending');assert.equal(s.tables.campaign_sends.length,0);
  }
});
for(const field of ['email','first_name','unsubscribe_token','unsubscribe_url_template']) test(`worker rejects changed approved ${field}`,async()=>{
  const s=await setup();
  if(field==='unsubscribe_url_template')s.campaign.dispatch[field]='https://unexpected.example.invalid/{{token}}';
  else s.tables.campaign_recipients[0][field]='unexpected';
  await s.run();assert.equal(s.fetchCount,0);assert.equal(s.campaign.send_status,'failed');
});

test('actual worker rejects untrusted callers before reading secrets or claiming outbox',async()=>{
  for(const token of ['', 'anon-key','fixture-runtime-key','forged-service-jwt']) {
    const s=await setup();const result=await s.run(token);
    assert.equal(result.status,403);assert.equal(s.fetchCount,0);assert.equal(s.claimed,false);assert.deepEqual(s.tableReads,[]);
  }
});
test('actual worker verifies active marketing operators, not ordinary/shared reporting staff',async()=>{
  for(const role of ['operator','staff']) {
    const s=await setup();s.authUser={id:'staff-a',role:'authenticated'};
    s.tables.trellis_users.push({auth_user_id:'staff-a',status:'active',role});
    const result=await s.run('session-token');
    assert.equal(s.authReads,1);assert.equal(result.status,role==='operator'?200:403);
    assert.equal(s.fetchCount,role==='operator'?1:0);
    if(role==='staff')assert.deepEqual(s.tableReads,['trellis_users']);
  }
});
test('staging and disabled/misconfigured workers do not even construct a privileged client',async()=>{
  for(const reason of ['staging','disabled','missing-enable','missing-manifest','wrong-hub','missing-environment']) {
    const s=await setup();
    if(reason==='staging'){env.NEWSLETTER_ENVIRONMENT='staging';env.SUPABASE_URL=`https://${stagingManifest.hub}.supabase.co`;env.NEWSLETTER_PROJECT_BINDINGS=JSON.stringify(stagingManifest);}
    if(reason==='disabled')env.NEWSLETTER_DISPATCH_ENABLED='false';
    if(reason==='missing-enable')delete env.NEWSLETTER_DISPATCH_ENABLED;
    if(reason==='missing-manifest')delete env.NEWSLETTER_PROJECT_BINDINGS;
    if(reason==='wrong-hub')env.SUPABASE_URL='https://wrong.invalid';
    if(reason==='missing-environment')delete env.NEWSLETTER_ENVIRONMENT;
    const result=await s.run();assert.equal(result.status,503);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(s.clientCount,0);assert.equal(s.claimed,false);assert.equal(s.fetchCount,0);
  }
});
test('actual worker preflight and wrong methods cannot dispatch or query Auth',async()=>{
  for(const [method,status] of [['OPTIONS',204],['GET',405]]) {
    const s=await setup();assert.equal((await s.run('',method)).status,status);assert.equal(s.clientCount,0);assert.equal(s.fetchCount,0);
  }
});
test('actual worker refuses queued campaigns from branches omitted from the manifest',async()=>{
  const s=await setup();env.NEWSLETTER_PROJECT_BINDINGS=JSON.stringify({...productionManifest,branches:{lanewise:productionManifest.branches.lanewise}});
  await s.run();assert.equal(s.fetchCount,0);assert.equal(s.campaign.send_status,'failed');
});

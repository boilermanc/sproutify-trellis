// Executes the actual worker with an in-memory SDK and mocked provider fetch.
// No Deno server, remote database or external network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { prepareReminder } from '../supabase/functions/_shared/newsletter-resend.mjs';
const id='579edbfb-33eb-439a-bee8-a8be1006137e';
const original={id,owner_id:'owner',branches:['atlurbanfarms'],name:'Original',send_status:'sent',dispatch:{html_template:'<p>Hello {{first_name}}</p>{{unsubscribe_url}}',from:'Test <test@example.invalid>'}};
const recipient={id:'recipient-uuid',email:'a@example.invalid',first_name:'A',unsubscribe_token:'fixture',status:'pending',campaign_id:'reminder-id'};
const fixture=()=>({campaign:structuredClone(original),recipients:[{...recipient,status:'sent',campaign_id:id}],sends:[{campaign_id:id,email:recipient.email,resend_email_id:'original-provider-id'}],events:[{campaign_id:id,email:recipient.email,resend_email_id:'original-provider-id',event_type:'delivered'}],suppressions:[]});
const moduleUrl=new URL('../supabase/functions/_shared/newsletter-resend.mjs',import.meta.url).href;
const worker=fs.readFileSync(new URL('../supabase/functions/campaign-sender/index.ts',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('const RATE_LIMIT_MS = 550','const RATE_LIMIT_MS = 0');
const source=`import {renderReminder,validateRendered,ResendSafetyError} from ${JSON.stringify(moduleUrl)};
  const loadReminder=(...args)=>globalThis.__workerFixture.load(...args);
  const requireScheduledWorkerUser=async()=>null;
  const createClient=()=>globalThis.__workerFixture.admin;\n`+worker;
let handler;
globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':'fixture-credential'},serve:callback=>{handler=callback;}};
await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));

async function setup() {
  const bundle=fixture();const audience=await prepareReminder(bundle,[recipient],{campaignId:id,userId:'owner',branch:'atlurbanfarms'},'Reminder');
  const campaign={...structuredClone(original),id:'reminder-id',subject:'Reminder',send_status:'queued',created_at:new Date().toISOString(),dispatch:{...original.dispatch,subject:'Reminder'},metadata:{resend_of:id,resend_safety_version:1,resend_fingerprint:audience.fingerprint}};
  const tables={campaigns:[campaign],campaign_recipients:[structuredClone(recipient)],campaign_sends:[],email_suppressions:[],tenant_secrets:[{resend_token:'fixture-provider-token'}]};
  const state={tables,campaign,bundle,loadCount:0,fetchCount:0,suppressionFailure:false,attributionFailure:false,providerFailure:false,claimed:false,providerRequests:[],providerCache:new Map()};
  const admin={rpc:async name=>{assert.equal(name,'claim_due_campaign');if(state.claimed)return {data:null};state.claimed=true;return {data:structuredClone(campaign)};},from:table=>{
    let predicates=[],update=null,upsert=null,count=false;
    const q={select:(_fields,options)=>{count=options?.count==='exact';return q;},eq:(field,value)=>{predicates.push(row=>row[field]===value);return q;},in:(field,values)=>{predicates.push(row=>values.includes(row[field]));return q;},order:()=>q,limit:()=>q,update:values=>{update=values;return q;},upsert:values=>{upsert=values;return q;},single:()=>q,
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        if(table==='email_suppressions'&&state.suppressionFailure)return {error:{message:'fixture outage'}};
        if(upsert){if(state.attributionFailure)return {error:{message:'fixture outage'}};for(const row of upsert)if(!tables[table].some(r=>r.resend_email_id===row.resend_email_id))tables[table].push(row);return {error:null};}
        const rows=tables[table].filter(row=>predicates.every(predicate=>predicate(row)));if(update)rows.forEach(row=>Object.assign(row,update));
        return {data:table==='tenant_secrets'?rows[0]:structuredClone(rows),count:count?rows.length:undefined,error:null};
      }).then(resolve,reject)};return q;}};
  state.admin=admin;state.load=async()=>{state.loadCount++;return {bundle,audience:await prepareReminder(bundle,[recipient],{campaignId:id,userId:'owner',branch:'atlurbanfarms'},'Reminder')};};
  globalThis.__workerFixture=state;
  globalThis.fetch=async(url,options)=>{
    state.fetchCount++;assert.equal(url,'https://api.resend.com/emails');const key=options.headers['Idempotency-Key'];assert.equal(key,'newsletter-reminder/reminder-id/recipient-uuid');
    const body=JSON.parse(options.body);assert.equal(body.to[0],recipient.email);assert.ok(!body.html.includes('{{'));assert.ok(body.headers['List-Unsubscribe']);
    state.providerRequests.push({key,body});
    if(state.providerFailure)return new Response('{}',{status:503});
    if(!state.providerCache.has(key))state.providerCache.set(key,{id:'fixture-provider-result'});
    return new Response(JSON.stringify(state.providerCache.get(key)),{status:200});
  };
  state.run=async()=>{state.claimed=false;return handler(new Request('https://fixture.invalid',{method:'POST'}));};return state;
}
test('worker dispatches valid reminder and persists provider campaign attribution',async()=>{
  const s=await setup();await s.run();assert.equal(s.fetchCount,1);assert.equal(s.tables.campaign_recipients[0].status,'sent');assert.equal(s.tables.campaign_sends[0].campaign_id,'reminder-id');assert.equal(s.campaign.send_status,'sent');
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

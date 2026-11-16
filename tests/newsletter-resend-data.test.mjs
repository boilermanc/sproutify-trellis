import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=new URL('../supabase/functions/_shared/newsletter-resend.mjs',import.meta.url).href;
const consentUrl=new URL('../supabase/functions/_shared/newsletter-consent.mjs',import.meta.url).href;
const source=fs.readFileSync(new URL('../supabase/functions/_shared/newsletter-resend-data.ts',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'');
const {loadReminder}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(`import {assertCampaign,prepareReminder,ResendSafetyError} from ${JSON.stringify(moduleUrl)};import {readBranchConsent} from ${JSON.stringify(consentUrl)};const createClient=()=>{throw Error('No real client permitted');};\n`+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const id='579edbfb-33eb-439a-bee8-a8be1006137e';
const selection={campaignId:id,userId:'owner',branch:'atlurbanfarms'};
function fixture() {
  const state={bundle:{campaign:{id,owner_id:'owner',branches:['atlurbanfarms'],send_status:'sent',dispatch:{html_template:'<p>Hello</p>'}},recipients:[{id:'recipient-uuid',email:'a@example.invalid'}],sends:[{campaign_id:id,resend_email_id:'message',email:'a@example.invalid'}],events:[{campaign_id:id,resend_email_id:'message',email:'a@example.invalid',event_type:'delivered'}],suppressions:[]},
    branch:{is_active:true,spoke_connection_id:'atl'},conn:{status:'active',supabase_url:'https://povudgtvzggnxwgtjexa.supabase.co'},rows:[{email:'a@example.invalid'}],rpcError:false,consentError:false};
  const admin={rpc:async()=>({data:state.bundle,error:state.rpcError?{}:null}),from:name=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[],count:0,error:null}),single:async()=>({data:name==='branches'?state.branch:state.conn})};return q;}};
  const spoke=()=>({rpc:(name,args)=>{
    assert.equal(name,'resolve_newsletter_audience');assert.deepEqual(args,{p_tags:null});
    return {order:column=>{assert.equal(column,'email');return {range:async(from,to)=>({data:state.rows?.slice(from,to+1),count:state.rows?.length,error:state.consentError?{}:null})};}};
  }});
  return {state,run:(key='fixture-service-key')=>loadReminder(admin,selection,'Reminder',spoke,key)};
}
test('adapter reads authoritative consent and retains safe source reference',async()=>{
  const h=fixture();const {audience}=await h.run();assert.equal(audience.final_count,1);assert.equal(audience.recipients[0].source_recipient_id,'recipient-uuid');
});
test('adapter paginates consent beyond a full page',async()=>{
  const h=fixture();h.state.rows=Array.from({length:1000},(_,i)=>({email:`fixture${i}@example.invalid`}));h.state.rows.push({email:'a@example.invalid'});assert.equal((await h.run()).audience.final_count,1);
});
test('an actual empty current-consent set excludes everyone',async()=>{
  const h=fixture();h.state.rows=[];const {audience}=await h.run();assert.equal(audience.final_count,0);assert.equal(audience.exclusions.no_current_consent,1);
});

function rekkrdFixture() {
  const h=fixture();
  h.state.bundle.campaign.branches=['rekkrd'];
  h.state.conn.supabase_url='https://cvqqiuhloefvaaacwxkg.supabase.co';
  h.state.rows=[{id:'a',email:'a@example.invalid',email_digest_optin:false,email_updates_optin:true}];
  const state=h.state;state.key='sb_secret_fixture';
  const admin={rpc:async name=>name==='get_spoke_connection_key'?{data:state.key,error:state.keyError}:{data:state.bundle},from:name=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[],count:0,error:null}),single:async()=>({data:name==='branches'?state.branch:state.conn})};return q;
  }};
  const spoke=(url,key)=>{
    assert.equal(url,state.conn.supabase_url);assert.equal(key,state.key);
    return {from:table=>{assert.equal(table,'profiles');return {select:columns=>{
      assert.equal(columns,'id,email,email_digest_optin,email_updates_optin');return {order:column=>{
        assert.equal(column,'id');return {range:async(from,to)=>({data:state.rows?.slice(from,to+1),count:state.rows?.length,error:state.consentError?{}:null})};
      }};
    }}}};
  };
  return {state,run:()=>loadReminder(admin,{...selection,branch:'rekkrd'},'Reminder',spoke,'')};
}

test('Rekkrd uses the union of explicit native consent preferences, not global fallback flags',async()=>{
  for(const [digest,updates,expected] of [[true,false,1],[false,true,1],[true,true,1],[false,false,0],[null,null,0],['true',false,0]]) {
    const h=rekkrdFixture();h.state.rows[0].email_digest_optin=digest;h.state.rows[0].email_updates_optin=updates;
    h.state.rows[0].is_subscribed=true;
    assert.equal((await h.run()).audience.final_count,expected);
  }
});
test('Rekkrd still excludes original openers and global/branch suppressions',async()=>{
  for(const reason of ['open','suppression']) {
    const h=rekkrdFixture();
    if(reason==='open')h.state.bundle.events.push({...h.state.bundle.events[0],event_type:'opened'});
    else h.state.bundle.suppressions.push({email:'a@example.invalid',reason:'unsubscribe'});
    assert.equal((await h.run()).audience.final_count,0);
  }
});
test('Rekkrd adapter paginates authoritative profile preferences',async()=>{
  const h=rekkrdFixture();const recipient=h.state.rows[0];
  h.state.rows=Array.from({length:1000},(_,i)=>({...recipient,id:String(i),email:`fixture${i}@example.invalid`}));h.state.rows.push(recipient);
  assert.equal((await h.run()).audience.final_count,1);
});
for(const reason of ['wrong-project','anonymous-key','missing-key','query-error','missing-data','missing-field']) test(`Rekkrd fails closed on ${reason}`,async()=>{
  const h=rekkrdFixture();
  if(reason==='wrong-project')h.state.conn.supabase_url='https://povudgtvzggnxwgtjexa.supabase.co';
  if(reason==='anonymous-key')h.state.key=`fixture.${btoa(JSON.stringify({role:'anon'}))}.fixture`;
  if(reason==='missing-key')h.state.key=null;
  if(reason==='query-error')h.state.consentError=true;
  if(reason==='missing-data')h.state.rows=null;
  if(reason==='missing-field')delete h.state.rows[0].email_updates_optin;
  await assert.rejects(()=>h.run());
});
for(const change of ['rpc-error','consent-error','missing-consent','wrong-connection','inactive-branch','missing-key']) test(`adapter stops on ${change}`,async()=>{
  const h=fixture();
  if(change==='rpc-error')h.state.rpcError=true;
  if(change==='consent-error')h.state.consentError=true;
  if(change==='missing-consent')h.state.rows=null;
  if(change==='wrong-connection')h.state.conn.supabase_url='https://other-business.invalid';
  if(change==='inactive-branch')h.state.branch.is_active=false;
  await assert.rejects(()=>h.run(change==='missing-key'?'':'fixture-service-key'));
});

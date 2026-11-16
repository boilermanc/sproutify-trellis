import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWSLETTER_CONSENT, readBranchConsent, consentPages } from '../supabase/functions/_shared/newsletter-consent.mjs';
import { prepareReminder, requireSamePreview } from '../supabase/functions/_shared/newsletter-resend.mjs';

const email='person@example.invalid';
const hubRow=(slug,extra={})=>({id:'hub-id',email,branches:[slug],is_subscribed:true,marketing_pause:false,status:'active',branch_consent:{[slug]:{subscribed:true,paused:false}},...extra});
function fixture(slug) {
  const contract=NEWSLETTER_CONSENT[slug];
  const state={branch:{is_active:true,spoke_connection_id:contract?.kind==='hub'?null:'connection'},
    conn:{status:'active',supabase_url:`https://${contract?.project}.supabase.co`},key:'sb_secret_fixture',rows:[],hubRows:[],authReads:[],
    users:new Map(),reads:[],nativeError:false,hubError:false};
  state.rows=[{id:'native-id',email,...Object.fromEntries((contract?.fields||[]).map(field=>[field,true]))}];
  if(contract?.kind==='hub')state.hubRows=[hubRow(slug)];
  if(contract?.kind==='home')state.users.set('native-id',{id:'native-id',email,user_metadata:{notification_prefs:{marketingEmails:true}}});
  const page=(hub=false)=>({range:async(from,to)=>({data:(hub?state.hubRows:state.rows)?.slice(from,to+1),count:(hub?state.hubRows:state.rows)?.length,error:(hub?state.hubError:state.nativeError)?{}:null})});
  const admin={rpc:async(name,args)=>{
    assert.equal(name,'get_spoke_connection_key');assert.equal(args.p_connection_id,state.branch.spoke_connection_id);
    return {data:state.key,error:null};
  },from:name=>{
    const q={select:columns=>{state.reads.push({name,columns});return q;},eq:()=>q,order:()=>q,range:page(true).range,
      single:async()=>({data:name==='spoke_connections'?state.conn:null,error:null})};
    assert.ok(['profiles','spoke_connections'].includes(name));return q;
  }};
  const createSpoke=(url,key)=>{
    assert.equal(url,state.conn.supabase_url);assert.equal(key,'sb_secret_fixture');
    return {from:name=>{
      assert.equal(name,contract.table);
      return {select:columns=>{assert.equal(columns,['id','email',...(contract.fields||[])].join(','));return {order:column=>{assert.equal(column,'id');return page();}};}};
    },rpc:(name,args)=>{assert.equal(name,contract.kind==='marketing-rpc'?'resolve_marketing_audience':'resolve_newsletter_audience');if(contract.kind==='atl')assert.deepEqual(args,{p_tags:null});return {order:()=>page()};},
    auth:{admin:{getUserById:async id=>{state.authReads.push(id);return {data:{user:state.users.get(id)},error:state.authError?{}:null};}}}};
  };
  return {state,run:(candidates=[email])=>readBranchConsent(admin,state.branch,slug,createSpoke,'sb_secret_fixture',candidates)};
}

test('all 11 configured branches have an explicit reviewed contract or an explicit block',()=>{
  assert.deepEqual(Object.keys(NEWSLETTER_CONSENT).sort(),['atlurbanfarms','rekkrd','rejoice','once-upon-a-drawing','sproutify-home','sproutify-farm','lanewise','spectiq','still-janes-daughter','sweetwater-technology','sweetwater-urban-farms'].sort());
});

for(const slug of ['rejoice','once-upon-a-drawing','rekkrd']) test(`${slug}: actual source flags grant only boolean true`,async()=>{
  for(const value of [true,false,null,'true',undefined]) {
    const h=fixture(slug);
    for(const field of NEWSLETTER_CONSENT[slug].fields)h.state.rows[0][field]=value;
    assert.equal((await h.run()).length,value===true?1:0);
  }
  const h=fixture(slug);delete h.state.rows[0][NEWSLETTER_CONSENT[slug].fields[0]];
  await assert.rejects(h.run,/fields are missing/);
});

test('Home uses explicitly persisted marketing preference; never MailerLite enrollment or UI defaults',async()=>{
  for(const value of [true,false,null,'true',undefined]) {
    const h=fixture('sproutify-home');h.state.rows[0].mailerlite_group_id=123;
    h.state.users.get('native-id').user_metadata.notification_prefs.marketingEmails=value;
    assert.equal((await h.run()).length,value===true?1:0);
  }
  const h=fixture('sproutify-home');h.state.users.get('native-id').user_metadata={};assert.equal((await h.run()).length,0);
});
test('Home verifies only original recipient identities and excludes disabled users',async()=>{
  const h=fixture('sproutify-home');h.state.rows.push({id:'unrelated',email:'unrelated@example.invalid'});
  assert.equal((await h.run()).length,1);assert.deepEqual(h.state.authReads,['native-id']);
  h.state.users.get('native-id').banned_until='2999-01-01T00:00:00Z';assert.equal((await h.run()).length,0);
  delete h.state.users.get('native-id').banned_until;h.state.users.get('native-id').deleted_at='2026-01-01';assert.equal((await h.run()).length,0);
});
test('Home resolves multiple bounded batches of original recipient preferences',async()=>{
  const h=fixture('sproutify-home');
  h.state.rows=Array.from({length:20},(_,index)=>({id:`native-${index}`,email:`person${index}@example.invalid`}));
  for(const row of h.state.rows)h.state.users.set(row.id,{...row,user_metadata:{notification_prefs:{marketingEmails:true}}});
  assert.equal((await h.run(h.state.rows.map(row=>row.email))).length,20);assert.equal(h.state.authReads.length,20);
});
for(const reason of ['auth-error','missing-user','wrong-id','wrong-email']) test(`Home fails closed on ${reason}`,async()=>{
  const h=fixture('sproutify-home');
  if(reason==='auth-error')h.state.authError=true;
  if(reason==='missing-user')h.state.users.clear();
  if(reason==='wrong-id')h.state.users.get('native-id').id='another-person';
  if(reason==='wrong-email')h.state.users.get('native-id').email='another@example.invalid';
  await assert.rejects(h.run,/Auth data/);
});

for(const slug of ['spectiq','still-janes-daughter','sweetwater-technology','sweetwater-urban-farms']) test(`${slug}: Hub-native consent requires membership, explicit branch opt-in and no global veto`,async()=>{
  const h=fixture(slug);assert.equal((await h.run()).length,1);
  for(const override of [{branches:[]},{branches:['another-branch']},{branch_consent:{}},{branch_consent:{[slug]:{subscribed:false,paused:false}}},
    {branch_consent:{[slug]:{subscribed:true,paused:true}}},{branch_consent:{[slug]:{subscribed:true}}},
    {is_subscribed:false},{is_subscribed:null},{marketing_pause:true},{marketing_pause:null},{status:'deleted'},{status:'inactive'}]) {
    h.state.hubRows=[hubRow(slug,override)];assert.equal((await h.run()).length,0);
  }
  h.state.branch.spoke_connection_id='new-connection';await assert.rejects(h.run,/configured source/);
});

for(const slug of ['atlurbanfarms','rekkrd','rejoice','once-upon-a-drawing','sproutify-home']) test(`${slug}: Hub global and branch vetoes override native consent; Hub consent cannot resurrect native opt-outs`,async()=>{
  const h=fixture(slug);assert.equal((await h.run()).length,1);
  for(const override of [{marketing_pause:true},{is_subscribed:false},{status:'deleted'},{branch_consent:null},{branch_consent:{[slug]:{subscribed:false,paused:false}}}]) {
    h.state.hubRows=[hubRow(slug,override)];assert.equal((await h.run()).length,0);
  }
  h.state.hubRows=[hubRow(slug)];h.state.rows=[];assert.equal((await h.run()).length,0);
});

for(const slug of ['sproutify-farm','lanewise']) test(`${slug}: the explicit opt-in RPC is required; no operational or Hub fallback`,async()=>{
  const h=fixture(slug);h.state.rows=[];h.state.hubRows=[hubRow(slug)];
  assert.equal((await h.run()).length,0);
  h.state.rows=[{id:'person',email}];assert.equal((await h.run()).length,1);
  h.state.nativeError=true;await assert.rejects(h.run,/could not be verified/);
  h.state.nativeError=false;h.state.rows=null;await assert.rejects(h.run,/could not be verified/);
});
test('every supported native adapter rejects missing/mismatched/inactive connections and credentials',async()=>{
  for(const slug of ['atlurbanfarms','rekkrd','rejoice','once-upon-a-drawing','sproutify-home','sproutify-farm','lanewise']) {
    for(const reason of ['missing','wrong','inactive','credential']) {
      const h=fixture(slug);
      if(reason==='missing')h.state.branch.spoke_connection_id=null;
      if(reason==='wrong')h.state.conn.supabase_url='https://other-business.supabase.co';
      if(reason==='inactive')h.state.conn.status='disconnected';
      if(reason==='credential'){
        if(slug==='atlurbanfarms')continue; // ATL uses its separate existing service secret.
        h.state.key='anonymous';
      }
      await assert.rejects(h.run);
    }
  }
});
test('unknown branch cannot borrow an existing contract',async()=>{
  const h=fixture('unknown');await assert.rejects(h.run,/no verified/);
});

for(const slug of ['rejoice','once-upon-a-drawing','sproutify-home','spectiq']) test(`${slug}: missing data, source errors and ambiguous identities stop; a real empty set is valid`,async()=>{
  for(const reason of ['error','missing','duplicate','hub-error']) {
    const h=fixture(slug),hub=NEWSLETTER_CONSENT[slug].kind==='hub';
    if(reason==='error')hub?h.state.hubError=true:h.state.nativeError=true;
    if(reason==='missing')hub?h.state.hubRows=null:h.state.rows=null;
    if(reason==='duplicate')hub?h.state.hubRows.push({...h.state.hubRows[0],email:email.toUpperCase()}):h.state.rows.push({...h.state.rows[0],email:email.toUpperCase()});
    if(reason==='hub-error')h.state.hubError=true;
    await assert.rejects(h.run);
  }
  const h=fixture(slug);if(NEWSLETTER_CONSENT[slug].kind==='hub')h.state.hubRows=[];else h.state.rows=[];
  assert.equal((await h.run()).length,0);
});

test('new source families paginate to completion and reject a later page failure',async()=>{
  const h=fixture('rejoice'),row=h.state.rows[0];
  h.state.rows=Array.from({length:1000},(_,i)=>({...row,id:String(i),email:`fixture${i}@example.invalid`}));h.state.rows.push(row);
  assert.equal((await h.run()).length,1001);
  await assert.rejects(()=>consentPages(()=>({range:async from=>from===0?{data:h.state.rows.slice(0,1000),count:h.state.rows.length}:{error:{message:'fixture outage'}}}),['email']),/could not be verified/);
});

test('server-capped pages cannot omit a later Hub unsubscribe',async()=>{
  const source=[hubRow('rejoice',{email:'first@example.invalid'}),hubRow('rejoice',{marketing_pause:true})];
  let calls=0;
  const rows=await consentPages(()=>({range:async from=>{calls++;return {data:source.slice(from,from+1),count:2};}}),['email']);
  assert.equal(calls,2);assert.equal(rows.length,2);assert.equal(rows[1].marketing_pause,true);
});
test('missing counts, inconsistent totals and premature empty pages fail closed',async()=>{
  for(const response of [{data:[]},{data:[],count:null},{data:[],count:1},{data:[{email}],count:0},{data:[],count:50001}]) {
    await assert.rejects(()=>consentPages(()=>({range:async()=>response}),['email']));
  }
  await assert.rejects(()=>consentPages(()=>({range:async from=>({data:[{email:from?'b@example.invalid':email}],count:from?3:2})}),['email']),/changed|incomplete/);
});

test('Rejoice opt-out, Home preference change and Hub branch pause invalidate a preview before send',async()=>{
  for(const slug of ['rejoice','sproutify-home','still-janes-daughter','sproutify-farm','lanewise']) {
    const h=fixture(slug),id='579edbfb-33eb-439a-bee8-a8be1006137e';
    const selection={campaignId:id,userId:'owner',branch:slug};
    const bundle={campaign:{id,owner_id:'owner',branches:[slug],send_status:'sent',dispatch:{html_template:'<p>Hello</p>'}},
      recipients:[{id:'recipient',email}],sends:[{campaign_id:id,resend_email_id:'message',email}],events:[{campaign_id:id,resend_email_id:'message',email,event_type:'delivered'}],suppressions:[]};
    const before=await prepareReminder(bundle,await h.run(),selection,'Reminder');
    if(slug==='rejoice')h.state.rows[0].marketing_opt_in=false;
    else if(slug==='sproutify-home')h.state.users.get('native-id').user_metadata.notification_prefs.marketingEmails=false;
    else if(['sproutify-farm','lanewise'].includes(slug))h.state.rows=[];
    else h.state.hubRows[0].branch_consent[slug].paused=true;
    const after=await prepareReminder(bundle,await h.run(),selection,'Reminder');
    assert.throws(()=>requireSamePreview({fingerprint:before.fingerprint,expires_at:Date.now()+10000},after),/new preview/);
  }
});

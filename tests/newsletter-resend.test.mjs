import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCampaign, buildResendAudience, prepareReminder, renderReminder, requireSamePreview, validateRendered } from '../supabase/functions/_shared/newsletter-resend.mjs';
import { createReminderHandler } from '../supabase/functions/newsletter-resend/handler.mjs';

const id = '579edbfb-33eb-439a-bee8-a8be1006137e';
const selection = { campaignId:id, userId:'owner', branch:'atlurbanfarms' };
const fixture = () => ({
  campaign: { id, owner_id:'owner', branches:['atlurbanfarms'], name:'Original', subject:'Hello 🙋\u200d♀️', send_status:'sent', dispatch:{html_template:'<p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>'} },
  recipients:['a','b','c'].map(name => ({email:`${name}@example.invalid`,first_name:name})),
  sends:['a','b','c'].map(name => ({campaign_id:id,email:`${name}@example.invalid`,resend_email_id:`msg-${name}`})),
  events:['a','b','c'].map(name => ({campaign_id:id,email:`${name}@example.invalid`,resend_email_id:`msg-${name}`,campaign_subject:'Hello 🙋♀️',event_type:'delivered'})),
  suppressions:[], source_version:'v1',
});
const consent = () => fixture().recipients;
const event = (name, type) => ({campaign_id:id,email:`${name}@example.invalid`,resend_email_id:`msg-${name}`,event_type:type});

test('invisible subject mismatch cannot affect campaign/message ID opener exclusion', async () => {
  const bundle=fixture(); bundle.events.push(event('a','opened'),event('a','opened'));
  assert.notEqual(bundle.campaign.subject,bundle.events[0].campaign_subject);
  const result=await prepareReminder(bundle,consent(),selection,'Reminder');
  assert.deepEqual(result.recipients.map(r=>r.email),['b@example.invalid','c@example.invalid']);
  assert.equal(result.exclusions.opened,1);
});

test('missing, zero, wrong campaign ID, wrong owner and business all stop', () => {
  for (const campaignId of [undefined,'','00000000-0000-0000-0000-000000000000','179f87b2-d89e-4dd2-b892-00f8d00fbfa5']) {
    assert.throws(()=>assertCampaign(fixture().campaign,{...selection,campaignId}));
  }
  assert.throws(()=>assertCampaign(null,selection));
  assert.throws(()=>assertCampaign(fixture().campaign,{...selection,userId:'another-business-owner'}));
  assert.throws(()=>assertCampaign(fixture().campaign,{...selection,branch:'rekkrd'}));
  const bundle=fixture();bundle.campaign.branches.push('rekkrd');assert.throws(()=>assertCampaign(bundle.campaign,selection));
});

test('service-verified marketing operator can act on a shared or legacy original; client role hints cannot',async()=>{
  const b=fixture();b.campaign.owner_id=null;b.authorized_for='operator';
  assert.equal((await prepareReminder(b,consent(),{...selection,userId:'operator'},'Reminder')).final_count,3);
  delete b.authorized_for;
  await assert.rejects(()=>prepareReminder(b,consent(),{...selection,userId:'operator',role:'admin'},'Reminder'),/not authorized/);
});

test('actual zero opens is valid only with complete successful event coverage', () => {
  assert.equal(buildResendAudience(fixture(),consent()).final_count,3);
  for (const events of [null,[],[event('a','sent')],fixture().events.slice(1)]) {
    assert.throws(()=>buildResendAudience({...fixture(),events},consent()),/data|incomplete/);
  }
  assert.throws(()=>buildResendAudience(fixture(),null),/consent/);
});

test('missing, ambiguous or mismatched provider mappings fail closed', () => {
  for (const mutate of [b=>b.sends.pop(),b=>b.sends.push(b.sends[0]),b=>b.sends[0].campaign_id='wrong',b=>b.events[0].email='wrong@example.invalid',b=>b.events[0].campaign_id='wrong']) {
    const b=fixture();mutate(b);assert.throws(()=>buildResendAudience(b,consent()));
  }
});

test('openers, clickers, bounces, complaints, suppressions, unsubscribes and absent consent are excluded', () => {
  for (const type of ['opened','clicked','bounced','complained']) {
    const b=fixture();b.events.push(event('a',type));assert.equal(buildResendAudience(b,consent()).final_count,2);
  }
  const b=fixture();b.suppressions=[{email:'A@example.invalid',reason:'unsubscribe'}];
  const result=buildResendAudience(b,consent().slice(0,2));
  assert.equal(result.final_count,1);assert.equal(result.exclusions.suppressed_or_unsubscribed,1);assert.equal(result.exclusions.no_current_consent,1);
});

test('placeholders in subject, body, attributes, encoded and formatted text block; real merge fields render', () => {
  for(const [subject,html] of [['[DATE]','Hello'],['Reminder','<p>[DATE]</p>'],['Reminder','<a href="https://example.invalid/[DATE]">Go</a>'],['Reminder','[DA<b>TE</b>]'],['Reminder','&#91;DATE&#93;'],['Reminder','{{unknown}}'],['Reminder','*|FNAME|*']]) {
    assert.throws(()=>renderReminder(subject,html,{email:'a@example.invalid'},'https://example.invalid/unsub'),/placeholder/);
  }
  const result=renderReminder('Hi {{first_name}}','<p>{{email}}</p>{{unsubscribe_url}}',{email:'a@example.invalid',first_name:'A & B'},'https://example.invalid/?a=1&b=2');
  assert.equal(result.subject,'Hi A & B');assert.match(result.html,/&amp;/);assert.doesNotThrow(()=>validateRendered('Reminder','<p>Ordinary [a note]</p>'));
});

function harness() {
  let bundle=fixture(), eligible=consent(), queued=0;
  const stored=new Map();let tokenNumber=0;
  const handler=createReminderHandler({authenticate:async token=>token==='owner-token'?'owner':null,
    load:async(sel,subject)=>({bundle,audience:await prepareReminder(bundle,eligible,sel,subject)}),
    sign:async payload=>{const token=String(++tokenNumber);stored.set(token,payload);return token;},verify:async token=>stored.get(token),
    enqueue:async()=>{if(queued)throw Error('Already requested');queued++;return {id:'reminder'};},now:()=>1000});
  const body={campaign_id:id,branch:'atlurbanfarms',subject:'Reminder'};
  return {handler,body,get bundle(){return bundle;},set eligible(value){eligible=value;},get queued(){return queued;}};
}

test('valid preview then send succeeds with safe sample and no client-supplied recipients', async () => {
  const h=harness();const {preview}=await h.handler({...h.body,action:'preview'},'owner-token');
  assert.equal(preview.total,3);assert.equal(preview.final_count,3);assert.ok(preview.sample.every(row=>!row.includes('@')));
  const result=await h.handler({...h.body,action:'send',preview_token:preview.token,recipients:[{email:'attacker@example.invalid'}]},'owner-token');
  assert.equal(result.campaign.id,'reminder');assert.equal(h.queued,1);
});

for(const change of ['suppression','unsubscribe','open','content','same-count-membership']) test(`change between preview and send: ${change} requires new preview`,async()=>{
  const h=harness();
  if(change==='same-count-membership')h.eligible=consent().slice(1);
  const {preview}=await h.handler({...h.body,action:'preview'},'owner-token');
  if(change==='suppression')h.bundle.suppressions.push({email:'a@example.invalid',reason:'bounce'});
  if(change==='unsubscribe')h.eligible=consent().slice(1);
  if(change==='open')h.bundle.events.push(event('a','opened'));
  if(change==='content')h.bundle.campaign.dispatch.html_template='<p>Changed content</p>';
  if(change==='same-count-membership'){h.eligible=consent().filter(row=>!row.email.startsWith('b@'));assert.equal(preview.final_count,2);}
  await assert.rejects(()=>h.handler({...h.body,action:'send',preview_token:preview.token},'owner-token'),/new preview/);assert.equal(h.queued,0);
});

test('duplicate submissions cannot create a second reminder',async()=>{
  const h=harness();const {preview}=await h.handler({...h.body,action:'preview'},'owner-token');
  const results=await Promise.allSettled([1,2].map(()=>h.handler({...h.body,action:'send',preview_token:preview.token},'owner-token')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.queued,1);
});

test('unauthenticated, forged, wrong-business, wrong-subject and missing previews stop',async()=>{
  const h=harness();await assert.rejects(()=>h.handler({...h.body,action:'preview'},'other'),/Sign in/);
  const {preview}=await h.handler({...h.body,action:'preview'},'owner-token');
  for(const changes of [{preview_token:undefined},{preview_token:'forged'},{subject:'Different'},{branch:'rekkrd'}]) {
    await assert.rejects(()=>h.handler({...h.body,action:'send',preview_token:preview.token,...changes},'owner-token'));
  }
  assert.throws(()=>requireSamePreview({fingerprint:'same',expires_at:1},{fingerprint:'same',final_count:1},2),/expired/);
  assert.equal(h.queued,0);
});

test('data-source failure is never converted into an empty successful audience',async()=>{
  const handler=createReminderHandler({authenticate:async()=> 'owner',load:async()=>{throw Error('event query failed');}});
  await assert.rejects(()=>handler({action:'preview'},'token'),/event query failed/);
});

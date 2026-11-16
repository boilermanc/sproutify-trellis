import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNewsletterProjectBindings, readNewsletterProjectBindings, newsletterBranchProject, newsletterDispatchAllowed, NEWSLETTER_CONSENT } from '../supabase/functions/_shared/newsletter-project-bindings.mjs';
import { productionManifest, productionBindings, stagingManifest, stagingBindings } from './helpers/newsletter-bindings.mjs';
import { prepareReminder, requireSamePreview } from '../supabase/functions/_shared/newsletter-resend.mjs';

const resolve=(environment,manifest,url)=>resolveNewsletterProjectBindings(environment,JSON.stringify(manifest),url || `https://${manifest.hub}.supabase.co`);
test('explicit production and staging bindings preserve source policies and require branch opt-in',()=>{
  assert.equal(newsletterBranchProject(stagingBindings,'sproutify-farm'),stagingManifest.branches['sproutify-farm']);
  assert.equal(newsletterBranchProject(productionBindings,'sproutify-farm'),NEWSLETTER_CONSENT['sproutify-farm'].project);
  assert.equal(NEWSLETTER_CONSENT['sproutify-farm'].kind,'marketing-rpc');
  assert.throws(()=>newsletterBranchProject(stagingBindings,'rekkrd'),/not enabled/);
  assert.throws(()=>newsletterBranchProject(stagingBindings,'toString'),/not enabled/);
  assert.equal(Object.isFrozen(stagingBindings.branches),true);
});
test('missing/invalid environment, manifest, hub or extra fields fail closed without a production default',()=>{
  for(const env of [undefined,'','dev','Staging'])assert.throws(()=>resolve(env,stagingManifest),/bindings/);
  for(const raw of [undefined,'','{','null','[]','{}'])assert.throws(()=>resolveNewsletterProjectBindings('staging',raw,'https://fixture.invalid'),/bindings/);
  for(const manifest of [{...stagingManifest,extra:true},{...stagingManifest,branches:{}},{...stagingManifest,branches:[]},{...stagingManifest,hub:'bad'},
    {...stagingManifest,branches:{unknown:'aaaaaaaaaaaaaaaaaaaa'}},{...stagingManifest,branches:{spectiq:'aaaaaaaaaaaaaaaaaaaa'}},
    {...stagingManifest,branches:{lanewise:'hub'}},{...stagingManifest,branches:{lanewise:null}}])assert.throws(()=>resolve('staging',manifest),/bindings/);
  assert.throws(()=>readNewsletterProjectBindings(()=>undefined),/bindings/);
});
test('staging rejects every registered production project even under a different branch',()=>{
  for(const ref of [productionManifest.hub,...Object.values(NEWSLETTER_CONSENT).map(c=>c.project).filter(Boolean)]) {
    assert.throws(()=>resolve('staging',{...stagingManifest,hub:ref}),/bindings/);
    assert.throws(()=>resolve('staging',{...stagingManifest,branches:{lanewise:ref}}),/bindings/);
  }
});
test('production rejects staging projects, cross-business mapping, duplicate spokes and hub reuse',()=>{
  assert.throws(()=>resolve('production',stagingManifest),/bindings/);
  assert.throws(()=>resolve('production',{...productionManifest,branches:{lanewise:NEWSLETTER_CONSENT['sproutify-farm'].project}}),/bindings/);
  assert.throws(()=>resolve('staging',{...stagingManifest,branches:{...stagingManifest.branches,lanewise:stagingManifest.branches['sproutify-farm']}}),/bindings/);
  assert.throws(()=>resolve('staging',{...stagingManifest,branches:{lanewise:stagingManifest.hub}}),/bindings/);
});
test('runtime hub origin must match exactly; unsafe URL variants are rejected',()=>{
  const base=`https://${stagingManifest.hub}.supabase.co`;
  assert.ok(resolve('staging',stagingManifest,base+'/'));
  for(const url of [base+'/rest',base+'?x=1',base+'#x',base+':443',base+'.evil.invalid',base.replace('https:','http:'),base.replace('https://','https://user@'),`https://${productionManifest.hub}.supabase.co`])assert.throws(()=>resolve('staging',stagingManifest,url),/bindings/);
});
test('staging never dispatches, and production requires an exact explicit enable value',()=>{
  for(const enabled of [undefined,'','true','TRUE',true,'false'])assert.equal(newsletterDispatchAllowed(stagingBindings,enabled),false);
  for(const enabled of [undefined,'','TRUE',true,'false'])assert.equal(newsletterDispatchAllowed(productionBindings,enabled),false);
  assert.equal(newsletterDispatchAllowed(productionBindings,'true'),true);
});
test('a binding change invalidates a preview even when recipient counts and content match',async()=>{
  const campaignId='11111111-1111-4111-a111-111111111111',selection={campaignId,userId:'owner',branch:'lanewise'};
  const bundle={campaign:{id:campaignId,owner_id:'owner',branches:['lanewise'],send_status:'sent',dispatch:{html_template:'Hello'}},recipients:[{id:'r',email:'fixture@example.invalid'}],sends:[{campaign_id:campaignId,email:'fixture@example.invalid',resend_email_id:'m'}],events:[{campaign_id:campaignId,email:'fixture@example.invalid',resend_email_id:'m',event_type:'delivered'}],suppressions:[]};
  const a=await prepareReminder(bundle,bundle.recipients,selection,'Reminder',{...stagingManifest,project:'llllllllllllllllllll'});
  const b=await prepareReminder(bundle,bundle.recipients,selection,'Reminder',{...stagingManifest,project:'aaaaaaaaaaaaaaaaaaaa'});
  assert.notEqual(a.fingerprint,b.fingerprint);
  assert.throws(()=>requireSamePreview({fingerprint:a.fingerprint,expires_at:Date.now()+1000},b),/changed/);
});

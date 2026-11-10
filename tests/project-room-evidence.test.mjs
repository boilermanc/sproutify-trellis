import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChiefScope} from '../supabase/functions/_shared/project-room-evidence.mjs';
import {proposalReviewRequest,readProposalReview,PROPOSAL_REVIEW_SCHEMA} from '../supabase/functions/_shared/project-room-proposal-review.mjs';
import {createRoom,nextRound,handoffPlan} from '../supabase/functions/_shared/project-room.mjs';
import {passingReview} from './fixtures/proposal-review.mjs';
test('chief cannot promote inconsistent effort ranges or a derived business age',()=>{
  for(const summary of ['Recommend 12–16 hours.','A 12-hour discovery.','22 years in business.']) assert.throws(()=>validateChiefScope({summary,proposals:[]}),/Needs rework/);
  assert.doesNotThrow(()=>validateChiefScope({summary:'Founded in 2002. Recommend discovery; account review is optional.',proposals:[]}));
});
test('final review receives original observation history and rejects an otherwise passing evidence failure',()=>{
  const room={title:'Test',brief:'Discovery',state:{summary:'Sitemap unverified',notes:[],rounds:[{outputs:{research:{text:'Sitemap observed Nov 8 at /sitemap.xml'},review:{text:'Later recheck hit anti-bot challenge'},openai:{text:'Scope limited to ten URLs; account review optional.'}}}]}};
  const prompt=proposalReviewRequest(room,{}).contents;
  assert.match(prompt,/Sitemap observed Nov 8/); assert.match(prompt,/Later recheck hit anti-bot/); assert.match(prompt,/ten URLs/);
  const response=JSON.parse(passingReview().text);
  response.checks.evidence={status:'needs_review',reason:'The summary erased an earlier successful sitemap observation after a blocked recheck.'};
  const result=readProposalReview(JSON.stringify(response));
  assert.equal(result.status,'needs_review'); assert.match(result.issues.join(' '),/erased an earlier/);
  delete response.checks.evidence;
  assert.throws(()=>readProposalReview(JSON.stringify(response)),/missing required checks/);
});

test('final review sees the full comparison baseline, including effort already included',()=>{
  const room={title:'ACA',state:{rounds:[],comparison:{baseline_proposal:{items:[{description:'Combined discovery',basis:'Includes AI search checks, report and walkthrough',quantity:5}]}}}};
  const prompt=proposalReviewRequest(room,{}).contents;
  assert.match(prompt,/comparison_baseline/);
  assert.match(prompt,/Includes AI search checks, report and walkthrough/);
});

test('company first pass and oversized Manus packet retain local research assignments; product rooms do not',()=>{
 const company=createRoom({kind:'client',title:'Local company',brief:'Research a local company and its customer opportunities.'});
 nextRound(company);
 for(const role of ['research','openai','anthropic','review','chief']) {
  const plan=handoffPlan(company,role);
  assert.match(plan.full,/Google Business Profile/);
  assert.match(plan.full,/Google customer reviews/);
  assert.match(plan.full,/Local social media \(Facebook first\)/);
  assert.match(plan.full,/sample size 0/);
  assert.match(plan.full,/Not verified — follow-up needed/);
  if(plan.oversized) {
   assert.match(plan.prefix,/Required coverage: Google Business Profile/);
   assert.match(plan.attachment.text,/up to 20 accessible recent reviews/);
   assert.ok(plan.availableBytes>=600);
  }
 }
 assert.match(handoffPlan(company,'chief').full,/Needs rework — local presence verification incomplete/);
 const product=createRoom({kind:'product',title:'Feature',brief:'Research an internal feature specification and alternatives.'});nextRound(product);
 assert.doesNotMatch(handoffPlan(product,'research').full,/Required company first-pass coverage/);
});

test('chief rejects missing local checks and cannot pass a declared unverified area',()=>{
 for(const key of ['google_business','google_reviews','local_social','supplied_links','related_businesses']) {
  assert.ok(PROPOSAL_REVIEW_SCHEMA.properties.checks.required.includes(key));
  const missing=JSON.parse(passingReview().text);delete missing.checks[key];
  assert.throws(()=>readProposalReview(JSON.stringify(missing)),/missing required checks/);
  const blocked=JSON.parse(passingReview().text);
  blocked.checks[key]={status:'needs_review',reason:`Needs rework: ${key} could not be verified because public access was blocked; supply the exact listing URL.`};
  blocked.input_needed=['Provide the exact public listing/page URL or dated evidence.'];
  const quality=readProposalReview(JSON.stringify(blocked));
  assert.equal(quality.status,'needs_review');
  assert.match(quality.issues.join(' '),/could not be verified/);
 }
 const prompt=proposalReviewRequest({title:'Client',state:{rounds:[]}},{}).contents;
 assert.match(prompt,/Zero readable reviews or snippet-only evidence is unverified/);
 assert.match(prompt,/lack of access alone cannot/);
});

test('ACA supplied links and Muse leads remain attributed evidence across research and chief handoffs',()=>{
 const room=createRoom({kind:'client',title:'ACA comparison',brief:'Investigate ACA and sister-brand lead Braemor. Supplied link https://www.facebook.com/ACALandscaping. Muse claims shared new address, different ratings; verify independently.'});nextRound(room);
 for(const role of ['research','review','chief']) {
  const plan=handoffPlan(room,role);
  assert.match(plan.full,/facebook.com\/ACALandscaping/);
  assert.match(plan.full,/Search failure never overrides a supplied link/);
  assert.match(plan.full,/current versus former versus announced\/future/);
  assert.match(plan.full,/never pool or transfer/);
  assert.match(plan.full,/AI\/Muse findings are leads to verify/);
  if(plan.attachment) {assert.match(plan.prefix,/Inspect supplied social links directly/);assert.ok(plan.availableBytes>=600);}
 }
 const prompt=proposalReviewRequest(room,{}).contents;
 assert.match(prompt,/pooled metrics/);assert.match(prompt,/No named related business can be silently omitted/);
});

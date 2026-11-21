import {passingReview} from './fixtures/proposal-review.mjs';
import {proposalReviewRequest,readProposalReview,REVIEW_CHECKS} from '../supabase/functions/_shared/project-room-proposal-review.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRequest, applyWorkEstimate } from '../supabase/functions/_shared/project-room-estimate.mjs';
import { draftProposal } from '../supabase/functions/_shared/project-room-proposal-draft.mjs';
import { createAutomaticProposal } from '../supabase/functions/_shared/project-room-auto-proposal.mjs';
import { createRoom, nextRound, applyChief, handoffPlan } from '../supabase/functions/_shared/project-room.mjs';
import { assessmentFixture } from './fixtures/company-assessment.mjs';
import { saveProposal, proposalTotals } from '../supabase/functions/_shared/project-room-proposal.mjs';
import { proposalDocx } from '../services/projectRoomProposal.mjs';
import { unzipSync, strFromU8 } from 'fflate';

function fixture() {
 const room=assessmentFixture(); room.title='ACA Landscaping';
 room.state.summary='## Discovery\nConfirm the reported ranking change with authorized data.\n## Optional new work\nCreate three service pages and install tracking.\n## Targeted Questions:\nWho can grant access?';
 const draft=draftProposal(room), request=estimateRequest(room,draft,{discoveryOnly:true});
 const id=request.evidence.split('\n').find(l=>l.includes('Confirm the reported ranking change')).match(/^\[(E\d+)\]/)[1];
 const tasks=[
  {description:'Review search evidence',hours:2,phase:'discovery',work_units:[{id:'search_review',description:'Review one authorized search performance export',hours:1.5},{id:'findings_notes',description:'Record query findings from the same export',hours:0.5}]},
  {description:'Check the discovery findings',hours:1,phase:'testing',work_units:[{id:'report_checks',description:'Check report conclusions against cited export rows',hours:1}]},
  {description:'Deliver discovery report',hours:1,phase:'handoff',work_units:[{id:'report_walkthrough',description:'One report walkthrough with the customer owner',hours:1}]},
 ].map(t=>({...t,optional:false,evidence_id:id,basis:'Bounded discovery work; access is a prerequisite, not assumed granted.',excludes:'Excludes implementation, waiting time, and the other task activities.'}));
 return {room,draft,request,tasks};
}

test('single wrapped estimate uses every existing validator; multiple estimates and invalid tasks fail',()=>{
 const {draft,request,tasks}=fixture();
 const direct=applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence);
 const wrapped=applyWorkEstimate(draft,JSON.stringify([{tasks}]),15000,request.evidence);
 assert.deepEqual(wrapped.items,direct.items);
 assert.throws(()=>applyWorkEstimate(draft,JSON.stringify([{tasks},{tasks}]),15000,request.evidence),/one bounded task object/);
 assert.throws(()=>applyWorkEstimate(draft,'[null]',15000,request.evidence),/one bounded task object/);
 const invalid=structuredClone(tasks);invalid[0].work_units[0].hours=99;
 assert.throws(()=>applyWorkEstimate(draft,JSON.stringify([{tasks:invalid}]),15000,request.evidence),/hours/);
});

test('ACA automatic draft leaves recommendations unpriced and preserves reviewable hours in Word',async()=>{
 const {room,draft,request,tasks}=fixture();
 const before=structuredClone(draft);
 const estimated=applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence);
 assert.deepEqual(draft,before);
 assert.equal(proposalTotals(estimated).once,60000);
 assert.equal(proposalTotals(estimated).optional_once,0);
 assert.match(estimated.items[0].basis,/export: 1.5h/);
 assert.match(estimated.items[0].basis,/Excludes implementation/);
 const saved=saveProposal(room,estimated,'owner');
 const xml=strFromU8(unzipSync(new Uint8Array(await (await proposalDocx(room,saved)).arrayBuffer()))['word/document.xml']);
 assert.match(xml,/Hours breakdown:/); assert.match(xml,/1.5h/);
 assert.equal(saved.stage,'proposal_drafted');
});

test('automatic discovery rejects implementation and contingency, even when research recommends them',()=>{
 for(const phase of ['implementation','contingency']) {
  const {draft,request,tasks}=fixture(); tasks.push({...tasks[0],description:'Extra '+phase,phase,optional:true});
  assert.throws(()=>applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence),/discovery only|contingency/);
 }
});

test('heading-only evidence, missing effort, mismatched math and duplicate activities cannot become prices',()=>{
 for (const [mutate,expected] of [
  [t=>{delete t[0].work_units;},/breakdown/],
  [t=>{t[0].hours=6;},/do not match/],
  [t=>{t[1].work_units[0]={...t[0].work_units[0],hours:1};},/more than once/],
  [t=>{t[1].work_units[0].description=t[0].work_units[0].description;},/more than once/],
  [t=>{delete t[0].excludes;},/exclusions/],
  [t=>{delete t[0].basis;},/breakdown/],
  [t=>{delete t[0].evidence_id;t[0].evidence='## Targeted Questions:';},/not a heading/],
 ]) {
  const {draft,request,tasks}=fixture(), before=structuredClone(draft); mutate(tasks);
  assert.throws(()=>applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence),expected);
  assert.deepEqual(draft,before);
 }
});

test('automatic scope failures alert and preserve the research without saving suspect fees',async()=>{
 const {room,tasks}=fixture(); room.state.rounds=[{stage:'done',number:1}];
 const original=room.state.summary; let alerts=0;
 tasks[0].phase='implementation';
 await createAutomaticProposal(room,{checkpoint:async()=>{},generate:async()=>({text:JSON.stringify({tasks})}),failed:async()=>alerts++});
 assert.equal(alerts,1); assert.equal(room.state.proposal,undefined);
 assert.equal(room.state.summary,original); assert.equal(room.state.proposal_generation.status,'failed');
});

test('research gets explicit role boundaries and final review retains flawed questions for audit',()=>{
 const room=createRoom({title:'ACA Landscaping',kind:'client',brief:'Kelly requests a website review after a reported loss of rankings.'});
 nextRound(room);
 for (const role of ['research','openai','anthropic','review','chief']) {
  const plan=handoffPlan(room,role); assert.match(plan.full,/Clint and Sheree are Trellis consultants/);
  if(plan.oversized) { assert.match(plan.prefix,/Clint and Sheree are Trellis consultants/); assert.ok(plan.availableBytes>=600); }
 }
 applyChief(room,{summary:'Customer decision-maker remains unknown.',questions:['Who is the final decision-maker (Clint, Sheree, or Kelly)?','Which services matter most?'],proposals:[],next_action:'ask_user'});
 assert.match(proposalReviewRequest(room,draftProposal(room)).contents,/Who is the final decision-maker \(Clint, Sheree, or Kelly\)/);
 assert.equal(room.state.questions[1],'Which services matter most?');
});


test('chief sees completed prices and source context, and a failing review never publishes prices',async()=>{
 const {room,tasks}=fixture(); room.state.rounds=[{stage:'done',number:1}];
 room.state.questions=['Who approves the customer budget?'];
 let reviewed=false,alerts=0;
 await createAutomaticProposal(room,{checkpoint:async()=>{},generate:async()=>({text:JSON.stringify({tasks}),model:'estimator'}),review:async prompt=>{
  reviewed=true; assert.match(prompt,/ACA Landscaping/);assert.match(prompt,/unit_cents/);assert.match(prompt,/Create three service pages/);assert.match(prompt,/Who approves the customer budget/);
  assert.equal(room.state.proposal,undefined);
  const response=passingReview(),data=JSON.parse(response.text);data.verdict='needs_review';data.checks.duplicate_work={status:'needs_review',reason:'The findings documentation repeats the report preparation already included in discovery.'};data.issues=['Separate report writing from the evidence review to avoid charging twice.'];
  return {...response,text:JSON.stringify(data)};
 },failed:async()=>alerts++});
 assert.equal(reviewed,true);assert.equal(alerts,1);
 assert.equal(room.state.proposal_generation.status,'needs_review');
 assert.equal(room.state.proposal_generation.review_model,'test-chief');
 assert.equal(room.state.proposal_generation.review_usage.output_tokens,50);
 assert.equal(proposalTotals(room.state.proposal).once,0);assert.equal(proposalTotals(room.state.proposal).unpriced,tasks.length);
 assert.deepEqual(room.state.proposal.items.map(item=>item.quantity),tasks.map(task=>task.hours));
 assert.ok(room.state.proposal.items.every(item=>item.unit_cents===null && item.basis.includes('Hours breakdown')));
 assert.match(room.state.proposal_generation.review.issues.join(' '),/charging twice/);
});

test('missing, contradictory and uncertain chief checks never count as approval',()=>{
 const good=JSON.parse(passingReview().text);
 assert.equal(readProposalReview(JSON.stringify(good)).status,'passed');
 assert.throws(()=>readProposalReview('{'),/incomplete/);
 for (const key of REVIEW_CHECKS) {
  const missing=structuredClone(good);delete missing.checks[key];
  assert.throws(()=>readProposalReview(JSON.stringify(missing)),/missing required checks/);
  const contradictory=structuredClone(good);contradictory.checks[key].status='needs_review';
  assert.equal(readProposalReview(JSON.stringify(contradictory)).status,'needs_review');
 }
 const issues=structuredClone(good);issues.issues=['Hours still need confirmation'];
 assert.equal(readProposalReview(JSON.stringify(issues)).status,'needs_review');
});

test('review failure preserves research and cannot fall through to ready',async()=>{
 const {room,tasks}=fixture();room.state.rounds=[{stage:'done',number:1}];let alerts=0;
 await createAutomaticProposal(room,{checkpoint:async()=>{},generate:async()=>({text:JSON.stringify({tasks})}),review:async()=>({text:'truncated'}),failed:async()=>alerts++});
 assert.equal(room.state.proposal_generation.status,'failed');assert.equal(room.state.proposal,undefined);assert.equal(alerts,1);
});

test('final review packet sanitizes sensitive IDs and does not silently truncate oversized evidence',()=>{
 const {room,draft}=fixture();room.state.notes=[{text:'Private ID 123-45-6789'}];
 const request=proposalReviewRequest(room,draft);assert.doesNotMatch(request.contents,/123-45-6789/);assert.match(request.contents,/REDACTED_ID/);
 room.state.summary='x'.repeat(241000);assert.throws(()=>proposalReviewRequest(room,draft),/too large/);
});
import {recordProposalReview} from '../supabase/functions/_shared/project-room-proposal-review.mjs';

test('needs rework preserves the original proposal, holds prices and keeps actionable input',()=>{
 const {room,draft,request,tasks}=fixture();
 const priced=applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence);
 saveProposal(room,priced,'owner');const original=structuredClone(room.state.proposal);
 const quality={status:'needs_review',issues:['Wrong roles: identify the customer approver instead of Clint or Sheree.'],input_needed:['Who at ACA approves the budget?'],checks:{}};
 recordProposalReview(room,room.state.proposal,quality,{model:'chief',usage:{input_tokens:1,output_tokens:2}},'owner');
 assert.equal(room.state.proposal_generation.status,'needs_review');
 assert.deepEqual(room.state.proposal_generation.held_proposal,original);
 assert.equal(proposalTotals(room.state.proposal).once,0);
 assert.ok(room.state.proposal.items.every(item=>item.unit_cents===null));
 assert.equal(room.state.proposal.stage,'proposal_drafted');
 assert.match(room.state.events.at(-1).text,/Needs rework/);
 recordProposalReview(room,room.state.proposal,quality,{model:'chief'},'owner');
 assert.deepEqual(room.state.proposal_generation.held_proposal,original);
 const fixed=structuredClone(original);
 recordProposalReview(room,fixed,readProposalReview(passingReview().text),{model:'chief'},'owner');
 assert.equal(room.state.proposal_generation.status,'ready');
 assert.equal(proposalTotals(room.state.proposal).once,60000);
 assert.match(room.state.events.at(-1).text,/Ready for your review/);
});

test('missing or outstanding input prevents a ready verdict',()=>{
 const response=JSON.parse(passingReview().text);delete response.input_needed;
 assert.throws(()=>readProposalReview(JSON.stringify(response)),/missing required checks/);
 response.input_needed=['Confirm who approves the customer budget'];
 assert.equal(readProposalReview(JSON.stringify(response)).status,'needs_review');
});
import {reworkIssues} from '../supabase/functions/_shared/project-room-proposal-review.mjs';
test('rework note shows corrections without repeating the detailed audit reasons',()=>{
 const review={issues:['Remove the unsupported work.','The scope includes unapproved implementation.'],checks:{scope:{reason:'The scope includes unapproved implementation.'}}};
 assert.deepEqual(reworkIssues(review),['Remove the unsupported work.']);
 assert.deepEqual(reworkIssues({issues:['Only finding'],checks:{scope:{reason:'Only finding'}}}),['Only finding']);
});
test('new discovery drafts do not claim implementation completion or training on unbuilt features',()=>{
 const draft=draftProposal(assessmentFixture());
 assert.doesNotMatch(draft.deliverables,/Implementation is complete/);
 assert.match(draft.deliverables,/not discovery deliverables/);
 assert.match(draft.deliverables,/one report walkthrough/);
});

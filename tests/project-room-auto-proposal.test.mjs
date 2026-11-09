import {passingReview} from './fixtures/proposal-review.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticProposal, needsAutomaticProposal} from '../supabase/functions/_shared/project-room-auto-proposal.mjs';
import {assessmentFixture} from './fixtures/company-assessment.mjs';
import {proposalTotals} from '../supabase/functions/_shared/project-room-proposal.mjs';
const ready = () => { const r=assessmentFixture(); r.state.rounds=[{stage:'done',number:1}]; return r; };
const output = () => ({model:'test',text:JSON.stringify({objective:'Customers reach the correct route and the owner maintains it independently.', tasks:[
 {description:'Validate enquiry route',hours:2,phase:'discovery',optional:false,basis:'One owner walkthrough and route check',evidence:'Confirm the enquiry route works'},
 {description:'Test the agreed route',hours:2,phase:'testing',optional:false,basis:'Phone and desktop',evidence:'Demonstrate the agreed checks'},
 {description:'Owner walkthrough',hours:1,phase:'handoff',optional:false,basis:'One walkthrough and guide',evidence:'owner the instructions and account ownership needed to operate independently'}].map((task,index)=>({...task,excludes:'Excludes implementation and work assigned to other tasks.',work_units:[{id:'discovery_'+index,description:'Discovery deliverable '+index+': '+task.description,hours:task.hours}]}))})});
test('research completion checkpoints before generating and saves a review-only draft',async()=>{
 const room=ready(), summary=room.state.summary, decisions=structuredClone(room.state.decisions); const order=[];
 await createAutomaticProposal(room,{checkpoint:async()=>{order.push('saved'); assert.equal(room.state.proposal_generation.status,'running');},generate:async()=>{order.push('generated'); return output();},review:async()=>{order.push('reviewed'); return passingReview();},failed:async()=>assert.fail()});
 assert.deepEqual(order,['saved','generated','reviewed']); assert.equal(room.state.proposal.stage,'proposal_drafted');
 assert.equal(proposalTotals(room.state.proposal).once,75000); assert.equal(room.state.proposal_generation.status,'ready');
 assert.equal(room.status,'awaiting_user'); assert.equal(room.state.summary,summary); assert.deepEqual(room.state.decisions,decisions);
 assert.equal(await createAutomaticProposal(room,{generate:async()=>assert.fail()}),false);
});
test('existing drafts, feature ideas, ongoing research and attempted runs never trigger',()=>{
 for(const patch of [r=>r.state.proposal={stage:'proposal_sent'},r=>r.kind='product',r=>r.status='running',r=>r.state.rounds[0].stage='chief',r=>r.state.proposal_generation={status:'running'},r=>r.state.proposal_generation={status:'failed'}]) { const room=ready(); patch(room); assert.equal(needsAutomaticProposal(room),false); }
});
test('invalid estimate preserves research, records failure and never invents fallback fees',async()=>{
 const room=ready(); let alerts=0;
 await createAutomaticProposal(room,{checkpoint:async()=>{},generate:async()=>({text:'truncated'}),failed:async()=>alerts++});
 assert.equal(room.state.proposal,undefined); assert.equal(room.status,'awaiting_user'); assert.equal(room.state.proposal_generation.status,'failed'); assert.equal(alerts,1);
});
test('failed checkpoint never spends tokens',async()=>{
 await assert.rejects(createAutomaticProposal(ready(),{checkpoint:async()=>{throw Error('version conflict');},generate:async()=>assert.fail(),failed:async()=>assert.fail()}),/version conflict/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChiefScope} from '../supabase/functions/_shared/project-room-evidence.mjs';
import {proposalReviewRequest,readProposalReview} from '../supabase/functions/_shared/project-room-proposal-review.mjs';
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

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftProposal,
  proposalDocx,
} from "../services/projectRoomProposal.mjs";
import {
  pipelineTotals,
  proposalSummary,
  proposalTotals,
  saveProposal,
  validateProposal,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
import { assessmentFixture } from "./fixtures/company-assessment.mjs";
import { strFromU8, unzipSync } from "fflate";
import { estimateRequest, applyWorkEstimate } from "../services/projectRoomEstimate.mjs";

test("estimation uses each client's evidence and calculates task hours at the entered rate", () => {
  for (const [scope, hours] of [["Repair the extension application route", 3], ["Reconcile historical lead sources", 7]]) {
    const room=assessmentFixture(); room.state.summary=scope;
    const draft=draftProposal(room), request=estimateRequest(room,draft);
    const response={tasks:[
      {description:scope,hours,phase:"discovery",optional:false,basis:"One bounded investigation with owner access.",evidence:scope},
      {description:"Test agreed result",hours:2,phase:"testing",optional:true,basis:"Phone and desktop acceptance checks.",evidence:"Demonstrate the agreed checks"},
      {description:"Train the owner",hours:1,phase:"handoff",optional:true,basis:"One walkthrough and operating notes.",evidence:"operate independently"},
    ]};
    const result=applyWorkEstimate(draft,JSON.stringify(response),17500,request.evidence);
    assert.equal(proposalTotals(result).once,hours*17500);
    assert.equal(proposalTotals(result).optional_once,52500);
    assert.equal(validateProposal(result).items[0].basis,response.tasks[0].basis);
    assert.match(request.body.contents,new RegExp(scope));
    response.tasks[0].evidence="A source quote that does not exist";
    assert.throws(()=>applyWorkEstimate(draft,JSON.stringify(response),17500,request.evidence),/supporting quote/);
  }
});
test("incomplete or unbounded estimates never fall back to package prices", () => {
  const draft=draftProposal(assessmentFixture());
  assert.throws(()=>applyWorkEstimate(draft,"{",15000,""),/incomplete/);
  assert.throws(()=>applyWorkEstimate(draft,'{"error":"need scope"}',15000,""),/scope detail/);
  assert.throws(()=>applyWorkEstimate(draft,'{}',0,""),/hourly planning rate/);
  assert.equal(draft.items[0].unit_cents,null);
});
test("numbered source references copy original evidence and reject invented IDs", () => {
 const room=assessmentFixture(), draft=draftProposal(room);
 draft.assumptions="At most three pages and twenty service entries.";
 const request=estimateRequest(room,draft);
 assert.ok(request.evidence.includes(draft.assumptions));
 const source=request.evidence.split("\n").find(line=>line.includes("Demonstrate the agreed checks"));
 const id=source.match(/^\[(E\d+)\]/)[1];
 const tasks=["discovery","testing","handoff"].map(phase=>({description:phase+" task",hours:2,phase,optional:phase!=="discovery",basis:"One bounded review pass.",evidence_id:id}));
 const result=applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence);
 assert.equal(result.items[0].evidence,source.slice(source.indexOf("] ")+2));
 tasks[0].evidence_id="E99999";
 assert.throws(()=>applyWorkEstimate(draft,JSON.stringify({tasks}),15000,request.evidence),/unknown evidence ID/);
});
test("new company proposals retain their own outcome and include one-time pricing and independent handoff", () => {
  const room = assessmentFixture();
  room.title = "Another Company";
  room.state.summary = "## What success looks like\n\nStaff can complete the daily order process without outside help.\n\n## Recommendation\n\nInspect the order integration before choosing fixes.";
  const draft = draftProposal(room);
  assert.match(draft.objective, /Staff can complete the daily order process/);
  assert.doesNotMatch(draft.objective, /Inspect the order integration/);
  assert.ok(draft.items.every((item) => item.frequency === "once"));
  assert.match(draft.deliverables, /operating instructions/);
  assert.match(draft.deliverables, /customer account ownership and access/);
  assert.match(draft.deliverables, /owner's acceptance and close the project/);
  assert.match(draft.scope, /Additional work needs a separately approved project/);
  validateProposal(draft);
});
test("proposal draft uses research, explicit assumptions, and optional fees outside the base", () => {
  const room = assessmentFixture(), draft = draftProposal(room);
  assert.match(draft.objective, /independently/);
  assert.match(draft.scope, /Research to validate/);
  assert.match(draft.pricing_basis, /Not estimated yet/);
  assert.deepEqual(proposalTotals(draft), {
    once: 0,
    monthly: 0,
    unpriced: 1,
    optional_once: 0,
    optional_monthly: 0,
  });
});
test("proposal validation rejects bad money, quantities, stage and dates; sanitizes text", () => {
  const draft = draftProposal(assessmentFixture());
  for (const value of [-1, 1.2, NaN, Infinity, 100000001]) {
    assert.throws(() =>
      validateProposal({
        ...draft,
        items: [{ ...draft.items[0], unit_cents: value }],
      })
    );
  }
  for (const value of [0, -1, 1.5, 10001]) {
    assert.throws(() =>
      validateProposal({
        ...draft,
        items: [{ ...draft.items[0], quantity: value }],
      })
    );
  }
  assert.throws(() => validateProposal({ ...draft, stage: "paid" }));
  assert.throws(() => validateProposal({ ...draft, close_date: "2027-02-30" }));
  assert.throws(() => validateProposal({ ...draft, items: [] }));
  assert.match(
    validateProposal({ ...draft, scope: "Contact 123-45-6789" }).scope,
    /REDACTED_ID/,
  );
  assert.equal(
    proposalTotals({
      ...draft,
      items: [{ ...draft.items[0], unit_cents: null }],
    }).unpriced,
    1,
  );
});
test("saved proposal preserves research and source snapshot, accepts only company rooms", () => {
  const room = assessmentFixture(), original = room.state.summary;
  saveProposal(
    room,
    { ...draftProposal(room), source_summary: "forged" },
    "owner",
    "2026-11-07T12:00:00Z",
  );
  assert.equal(room.state.summary, original);
  assert.equal(room.state.proposal.source_summary, original);
  room.state.summary = "New findings";
  saveProposal(room, { ...room.state.proposal, stage: "won" }, "member");
  assert.equal(room.state.proposal.source_summary, original);
  assert.equal(room.state.proposal.stage, "won");
  assert.throws(() =>
    saveProposal({ ...room, kind: "product" }, draftProposal(room), "owner")
  );
});
test("pipeline excludes archived, cancelled, lost, won and optional fees from open totals", () => {
  const p = proposalSummary(draftProposal(assessmentFixture()));
  const rooms = [
    { id: "1", kind: "client", status: "awaiting_user", proposal: p },
    { id: "2", kind: "client", status: "draft" },
    {
      id: "3",
      kind: "client",
      status: "draft",
      proposal: { ...p, stage: "won" },
    },
    {
      id: "4",
      kind: "client",
      status: "draft",
      proposal: { ...p, stage: "lost" },
    },
    {
      id: "5",
      kind: "client",
      status: "draft",
      client_id: "archived",
      proposal: p,
    },
    { id: "6", kind: "product", status: "draft", proposal: p },
    { id: "7", kind: "client", status: "cancelled", proposal: p },
  ];
  const totals = pipelineTotals(rooms, [{
    id: "archived",
    archived_at: "2026-11-07",
  }]);
  assert.equal(totals.once, 0);
  assert.equal(totals.monthly, 0);
  assert.equal(totals.won_once, 0);
  assert.equal(totals.unpriced, 2);
  assert.equal(totals.open.length, 2);
});
test("proposal Word contains scope, fees, assumptions and draft status without assessment decision log", async () => {
  const room = assessmentFixture();
  const zip = unzipSync(
    new Uint8Array(
      await (await proposalDocx(room, draftProposal(room))).arrayBuffer(),
    ),
  );
  const xml = strFromU8(zip["word/document.xml"]);
  for (
    const text of [
      "CONSULTING PROPOSAL",
      "What success looks like",
      "Completion checks and handoff",
      "To be priced",
      "Internal work and hours breakdown",
      "Payment schedule",
      "Internal planning draft",
    ]
  ) assert.ok(xml.includes(text), text);
  assert.ok(!xml.includes("Decision log"));
  assert.ok(!xml.includes("per month"));
  assert.ok(xml.indexOf("What success looks like") < xml.indexOf("One-time project investment"));
  assert.match(xml, /w:tblHeader/);
});

test("recurring fees cannot be saved or exported, and are not converted to project fees", async () => {
  const room = assessmentFixture(), draft = draftProposal(room);
  draft.items.push({description: "Legacy support", quantity: 1, unit_cents: 60000, frequency: "monthly", optional: false});
  assert.throws(() => validateProposal(draft), /one-time fees/);
  await assert.rejects(() => proposalDocx(room, draft), /one-time fees/);
  assert.equal(proposalTotals(draft).once, 0);
  assert.equal(proposalTotals(draft).monthly, 60000);
});

// Estimates must come from the current room, never a package-price fallback.
test("unestimated proposals have no automatic dollar allowance", () => {
 const p=draftProposal(assessmentFixture());
 assert.ok(p.items.every(i=>i.unit_cents===null));
 assert.equal(proposalTotals(p).unpriced,1);
});

test("Word exports the reviewable task math, assumptions and evidence", async () => {
 const room=assessmentFixture(), p=draftProposal(room);
 p.items=[{description:"Verify three booking routes",quantity:3,unit_cents:17500,frequency:"once",optional:false,estimate_unit:"hours",phase:"testing",basis:"Three routes on phone and desktop.",evidence:"Saved research requires booking route validation."}];
 const saved=saveProposal(room,p,"owner");
 const zip=unzipSync(new Uint8Array(await (await proposalDocx(room,saved)).arrayBuffer()));
 const xml=strFromU8(zip["word/document.xml"]);
 for(const text of ["3 hours","$175.00","$525.00","Three routes on phone and desktop.","Saved research requires booking route validation."]) assert.ok(xml.includes(text),text);
});

test("optional implementation keeps its testing handoff and contingency outside base fees", () => {
 const p=draftProposal(assessmentFixture()), evidence="Evidence for the scoped project work.";
 const tasks=["discovery","implementation","testing","handoff","contingency"].map(phase=>({description:phase,hours:2,phase,optional:phase==="implementation",basis:"Bounded task allowance.",evidence}));
 const result=applyWorkEstimate(p,JSON.stringify({tasks}),15000,evidence);
 assert.equal(proposalTotals(result).once,30000);
 assert.equal(proposalTotals(result).optional_once,120000);
 assert.ok(result.items.filter(t=>t.phase!=="discovery").every(t=>t.optional));
});

// Reruns must reconcile prior work rather than regenerate a differently priced package.
function reconciliationFixture() {
  const room = assessmentFixture(), proposal = draftProposal(room);
  const phases = ['discovery', 'testing', 'handoff'];
  proposal.items = phases.map(phase => ({description: phase + ' bounded work', quantity: 2, unit_cents: 15000,
    estimate_unit: 'hours', phase, frequency: 'once', optional: phase !== 'discovery',
    basis: 'One bounded pass, excluding other phase work.', evidence: 'Demonstrate the agreed checks'}));
  const request = estimateRequest(room, proposal);
  const id = request.evidence.split('\n').find(line => line.includes('Demonstrate the agreed checks')).match(/^\[(E\d+)\]/)[1];
  const tasks = proposal.items.map((item, index) => ({description:item.description, hours:item.quantity, phase:item.phase,
    optional:item.optional, basis:item.basis, evidence_id:id, previous_ids:['P'+(index+1)], change_reason:'Retain the original bounded scope, assumptions and hours without expansion.'}));
  return {proposal,request,tasks,id};
}
test('rerun sends the baseline and retains unchanged work with reviewable totals', async () => {
  const {estimateChanges} = await import('../supabase/functions/_shared/project-room-estimate.mjs');
  const {proposal,request,tasks} = reconciliationFixture();
  assert.match(request.body.contents, /PREVIOUS ESTIMATE/);
  assert.match(request.body.contents, /"id":"P1"/);
  assert.match(request.body.contents, /"hours":2/);
  const before=structuredClone(proposal);
  const pending=applyWorkEstimate(proposal,JSON.stringify({tasks}),17500,request.evidence);
  const diff=estimateChanges(proposal,pending);
  assert.deepEqual(proposal,before);
  assert.equal(diff.before.hours,6); assert.equal(diff.after.hours,6);
  assert.equal(diff.before.cents,90000); assert.equal(diff.after.cents,105000);
  assert.equal(diff.lines.length,3);
  assert.match(pending.items[0].basis,/Previous P1: 2 hours; proposed: 2 hours/);
  assert.match(pending.pricing_basis,/6 -> 6 total hours/);
});
test('rerun rejects unexplained hour or scope inflation and silently omitted prior work', () => {
  for (const mutate of [
    tasks=>tasks[0].hours=8,
    tasks=>tasks[0].description='Broader replacement scope',
    tasks=>tasks[0].optional=true,
    tasks=>delete tasks[0].previous_ids,
    tasks=>tasks[0].previous_ids=[],
    tasks=>tasks[0].previous_ids=['P3'],
  ]) {
    const {proposal,request,tasks}=reconciliationFixture(); delete tasks[0].change_reason; mutate(tasks);
    assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/reason|Map each|mapped twice|missing/);
  }
});
test('rerun records explained consolidation and explicit removal without double-counting baseline IDs', () => {
  const {proposal,request,tasks}=reconciliationFixture();
  proposal.items.push({...proposal.items[0],description:'Extra validation pass',quantity:1});
  tasks[0].previous_ids=['P1','P4']; tasks[0].hours=3;
  tasks[0].change_reason='Consolidate the earlier extra validation pass into discovery without adding effort.';
  const result=applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence);
  assert.match(result.items[0].basis,/Previous P1, P4: 3 hours; proposed: 3 hours/);
  tasks[0].previous_ids=['P1']; tasks[0].hours=2;
  const removed_tasks=[{previous_ids:['P4'],change_reason:'Remove the duplicate validation pass already included in the first task.'}];
  const removed=applyWorkEstimate(proposal,JSON.stringify({tasks,removed_tasks}),15000,request.evidence);
  assert.match(removed.pricing_basis,/Removed P4: 1 hours/);
  assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/missing/);
  removed_tasks[0].previous_ids=['P1'];
  assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks,removed_tasks}),15000,request.evidence),/mapped twice/);
});
test('new work on a rerun requires a numbered source reference and added-scope explanation', () => {
  const {proposal,request,tasks,id}=reconciliationFixture();
  tasks.push({description:'New bounded implementation',hours:1,phase:'implementation',optional:true,basis:'One approved page edit.',previous_ids:[],evidence_id:id});
  assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/change reason/);
  tasks[3].change_reason='Add one page edit that was previously excluded from this estimate.';
  const result=applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence);
  assert.match(result.items[3].basis,/new work: 0 hours; proposed: 1 hours/);
  delete tasks[3].evidence_id; tasks[3].evidence='Demonstrate the agreed checks';
  assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/numbered evidence/);
});
test('duplicate descriptions and repeated finishing phases are rejected for new estimates too', () => {
  const {proposal,request,tasks}=reconciliationFixture();
  const unpriced=draftProposal(assessmentFixture());
  const copy=structuredClone(tasks); copy[1].description=copy[0].description.toUpperCase()+'!';
  assert.throws(()=>applyWorkEstimate(unpriced,JSON.stringify({tasks:copy}),15000,request.evidence),/repeats a task/);
  for (const phase of ['testing','handoff','contingency']) {
    const repeated=structuredClone(tasks);
    if(phase==='contingency') repeated.push({...tasks[0],description:'First contingency',phase});
    repeated.push({...tasks[0],description:'Another '+phase,phase});
    assert.throws(()=>applyWorkEstimate(unpriced,JSON.stringify({tasks:repeated}),15000,request.evidence),/Consolidate/);
  }
  proposal.items[0].estimate_unit='units';
  assert.throws(()=>estimateRequest(assessmentFixture(),proposal),/fixed-fee/);
  assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/fixed-fee/);
});


test('rerun preserves unpriced hour tasks and scrubs baseline data before AI submission', () => {
  const {proposal,tasks}=reconciliationFixture();
  proposal.items[0].unit_cents=null;
  proposal.items[0].basis='Source has private ID 123-45-6789';
  const request=estimateRequest(assessmentFixture(),proposal);
  assert.match(request.body.contents,/"id":"P1"/);
  assert.doesNotMatch(request.body.contents,/123-45-6789/);
  assert.match(request.body.contents,/REDACTED_ID/);
  const result=applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence);
  assert.equal(result.items[0].quantity,2);
  proposal.items[0].estimate_unit='units';
  assert.throws(()=>estimateRequest(assessmentFixture(),proposal),/unpriced unit/);
});


test('same-hours rerun cannot hide changed assumptions or evidence without explanation', () => {
 const {proposal,request,tasks}=reconciliationFixture();
 tasks[0].basis='Broader access and scope assumption with the same nominal hours.';
 delete tasks[0].change_reason;
 assert.throws(()=>applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence),/change reason/);
 tasks[0].change_reason='Scope assumption has changed; access now covers the additional route within this allowance.';
 const result=applyWorkEstimate(proposal,JSON.stringify({tasks}),15000,request.evidence);
 assert.match(result.items[0].basis,/Scope assumption has changed/);
});

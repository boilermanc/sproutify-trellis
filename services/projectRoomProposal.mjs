import { assessmentSections } from "./companyAssessment.mjs";
import {
  money,
  proposalTotals,
  validateProposal,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
export function draftProposal(room) {
  const sections = assessmentSections(room.state.summary);
  const section = (name) =>
    sections.find((s) => s.title.toLowerCase() === name)?.text || "";
  return {
    schema_version: 1,
    title: `${room.title} consulting proposal`,
    stage: "proposal_drafted",
    currency: "USD",
    close_date: null,
    objective: section("what success looks like") ||
      "After the agreed work, your team can use the improved process independently, with the agreed checks completed and ownership clearly handed over.\n\nBefore sending: describe the specific day-to-day improvement the owner wants and agree how to measure it. Discovery delivers a clear diagnosis and plan; implementation is a separate decision.",
    scope:
      "Phase 1 — Discovery and validation\nReview the existing findings with the owner, verify the highest-priority issues using authorized access, and agree the work worth doing.\n\nResearch to validate:\n" +
      (section("discovery") || section("prioritized findings") ||
        "Confirm the main problem, current workflow and success measures.") +
      "\n\nPhase 2 — Optional implementation allowance\nOnly proceed after discovery confirms scope and the owner approves it. Candidate improvements from the assessment:\n" +
      (section("improve what exists") ||
        "Scope improvements separately after discovery.") +
      "\n\nFinish — Verify and hand over\nDemonstrate the agreed checks, give the owner the instructions and account ownership needed to operate independently, and record acceptance. Additional work needs a separately approved project.",
    deliverables:
      "1. Discovery is complete when the owner receives verified findings, a baseline, a prioritized plan and a decision on which fixes to pursue.\n2. Before implementation, agree the specific result, scope, fixed price and pass/fail checks with the owner.\n3. Implementation is complete when the agreed checks pass and the owner has reviewed the results.\n4. Handoff includes operating instructions, a walkthrough, confirmation of customer account ownership and access, and a record of exclusions or unresolved items.\n5. Record the owner's acceptance and close the project. Additional work requires a separately approved project; ongoing service is not included.",
    timeline:
      "Discovery planning window: 1–2 weeks after access and kickoff. Agree a separate implementation finish date before work starts, including verification and handoff. Confirm access and availability before committing to dates.",
    assumptions:
      "This is an internal proposal guide, not an approved quote. Findings remain subject to validation. The owner supplies authorized access and approves scope. Third-party charges, taxes and platform limitations require confirmation.",
    exclusions:
      "No ongoing services, monitoring or retainers. Implementation and website rebuilds require a separately approved scope and price. Advertising and third-party subscriptions are customer responsibilities. No guarantee of rankings, lead volume, or revenue.",
    payment_terms:
      "Suggested terms for review: 50% at kickoff and 50% on delivery for fixed-scope work. Confirm final terms before sending to the customer.",
    next_step:
      "Review scope and pricing internally, confirm the owner's priorities, then decide whether to send a customer proposal.",
    pricing_basis:
      "Suggested internal estimate, not an approved rate card: $150 per hour. Discovery assumes 8 hours; optional implementation assumes 18 hours including verification and handoff. These are planning allowances to review against actual scope, not market quotes or tracked time.",
    items: [{
      description:
        "Discovery — understand the problem and choose the right fixes",
      quantity: 1,
      unit_cents: 120000,
      frequency: "once",
      optional: false,
    }, {
      description:
        "Implementation — agreed fixes, verified results and owner handoff (allowance)",
      quantity: 1,
      unit_cents: 270000,
      frequency: "once",
      optional: true,
    }],
  };
}
const cell = (value) =>
  String(value).replaceAll("|", "/").replaceAll("\n", " ");
export function proposalDocumentRoom(room, proposal) {
  validateProposal(proposal);
  const totals = proposalTotals(proposal);
  const table = [
    "| Project outcome | One-time investment |",
    "| --- | --- |",
    ...proposal.items.map((i) =>
      `| ${i.optional ? "OPTIONAL — " : ""}${
        cell(i.description)
      } | ${
        i.unit_cents === null
          ? "To be priced"
          : money(i.unit_cents * i.quantity)
      } |`
    ),
  ].join("\n");
  const summary = [
    ["What success looks like", proposal.objective],
    ["How we get there", proposal.scope],
    ["Completion checks and handoff", proposal.deliverables],
    ["Schedule", proposal.timeline],
    [
      "One-time project investment",
      `${table}\n\n**Priced one-time fees: ${
        money(totals.once)
      }**\n\n${
        totals.unpriced
          ? `${totals.unpriced} included item(s) still need pricing; these are partial totals.`
          : "Included fees are priced."
      }\n\nOptional work is excluded from the totals: ${
        money(totals.optional_once)
      } one-time. Additional work requires a separately approved project.`,
    ],
    ["Payment schedule", proposal.payment_terms],
    ["Assumptions and client responsibilities", proposal.assumptions],
    ["Not included", proposal.exclusions],
    ["Next steps", proposal.next_step],
    ["Internal estimating notes", proposal.pricing_basis],
  ].map(([title, text]) => `## ${title}\n\n${text || "To be confirmed."}`).join(
    "\n\n",
  );
  return {
    ...room,
    state: { ...room.state, summary, questions: [], decisions: [] },
  };
}
export async function proposalDocx(room, proposal) {
  const { assessmentDocx } = await import("./companyAssessmentDocx.mjs");
  return assessmentDocx(proposalDocumentRoom(room, proposal), {
    subtitle: proposal.title,
    eyebrow: "CONSULTING PROPOSAL / INTERNAL PLANNING DRAFT",
    caption:
      "For internal review — scope, pricing and terms require approval before customer use",
    sectionLabel: "PROPOSAL",
    footerLabel: "Proposal guide",
    includeDiscussion: false,
    disclaimer:
      "Internal planning draft. Prices and terms are not approved customer commitments. Confirm scope, fees, tax treatment, third-party costs and acceptance criteria before sending a proposal.",
  });
}

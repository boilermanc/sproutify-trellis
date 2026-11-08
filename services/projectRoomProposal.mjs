import { assessmentSections } from "./companyAssessment.mjs";
import {
  money,
  proposalTotals,
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
    objective: section("recommendation") || room.state.intake?.objective ||
      "Confirm the business objective with the owner.",
    scope:
      "Phase 1 — Discovery and validation\nReview the existing findings with the owner, verify the highest-priority issues using authorized access, and agree the work worth doing.\n\nResearch to validate:\n" +
      (section("discovery") || section("prioritized findings") ||
        "Confirm the main problem, current workflow and success measures.") +
      "\n\nPhase 2 — Optional implementation allowance\nOnly proceed after discovery confirms scope and the owner approves it. Candidate improvements from the assessment:\n" +
      (section("improve what exists") ||
        "Scope improvements separately after discovery.") +
      "\n\nOptional monthly review\nReview agreed performance measures, record progress, and recommend next actions. Tool subscriptions and advertising spend are separate.",
    deliverables:
      "1. A documented baseline and verified issue list.\n2. A prioritized action plan with acceptance checks.\n3. A separate implementation scope and price for work the owner chooses to pursue.\n4. If optional implementation is selected: agreed fixes, documented acceptance checks and handoff notes.\n5. If monthly support is selected: a monthly performance summary and next-action list.",
    timeline:
      "Suggested planning window: 1–2 weeks after access and kickoff. Confirm effort, access, and availability before committing to dates.",
    assumptions:
      "This is an internal proposal guide, not an approved quote. Findings remain subject to validation. The owner supplies authorized access and approves scope. Third-party charges, taxes and platform limitations require confirmation.",
    exclusions:
      "Implementation, website rebuilds, advertising spend, subscriptions, and ongoing support are excluded unless explicitly priced and included. No guarantee of rankings, lead volume, or revenue.",
    payment_terms:
      "Suggested terms for review: 50% at kickoff and 50% on delivery for fixed-scope work. Confirm final terms before sending to the customer.",
    next_step:
      "Review scope and pricing internally, confirm the owner's priorities, then decide whether to send a customer proposal.",
    pricing_basis:
      "Suggested internal estimate, not an approved rate card: $150 per hour. Discovery assumes 8 hours; optional implementation assumes 18 hours; optional ongoing review assumes 4 hours per month. These are planning allowances to review against actual scope, not market quotes or tracked time.",
    items: [{
      description:
        "Phase 1 — Discovery and validation, baseline, and prioritized action plan",
      quantity: 8,
      unit_cents: 15000,
      frequency: "once",
      optional: false,
    }, {
      description:
        "Implementation allowance — confirm scope and acceptance criteria after discovery",
      quantity: 18,
      unit_cents: 15000,
      frequency: "once",
      optional: true,
    }, {
      description: "Ongoing review and reporting — optional monthly allowance",
      quantity: 4,
      unit_cents: 15000,
      frequency: "monthly",
      optional: true,
    }],
  };
}
const cell = (value) =>
  String(value).replaceAll("|", "/").replaceAll("\n", " ");
export function proposalDocumentRoom(room, proposal) {
  const totals = proposalTotals(proposal);
  const table = [
    "| Scope / fee item | Quantity | Unit fee | Frequency | Line total |",
    "| --- | --- | --- | --- | --- |",
    ...proposal.items.map((i) =>
      `| ${i.optional ? "OPTIONAL — " : ""}${
        cell(i.description)
      } | ${i.quantity} | ${
        i.unit_cents === null ? "To be priced" : money(i.unit_cents)
      } | ${i.frequency === "monthly" ? "Monthly" : "One-time"} | ${
        i.unit_cents === null
          ? "To be priced"
          : money(i.unit_cents * i.quantity)
      } |`
    ),
  ].join("\n");
  const summary = [
    ["Proposal overview", proposal.objective],
    ["Scope of work", proposal.scope],
    ["Deliverables and acceptance", proposal.deliverables],
    ["Schedule", proposal.timeline],
    [
      "Fees and cost structure",
      `${table}\n\n**Priced one-time fees: ${
        money(totals.once)
      }**\n\n**Priced monthly fees: ${money(totals.monthly)} per month**\n\n${
        totals.unpriced
          ? `${totals.unpriced} included item(s) still need pricing; these are partial totals.`
          : "Included fees are priced."
      }\n\nOptional work is excluded from the totals: ${
        money(totals.optional_once)
      } one-time and ${
        money(totals.optional_monthly)
      } per month.\n\n${proposal.pricing_basis}`,
    ],
    ["Payment schedule", proposal.payment_terms],
    ["Assumptions and client responsibilities", proposal.assumptions],
    ["Not included", proposal.exclusions],
    ["Next steps", proposal.next_step],
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

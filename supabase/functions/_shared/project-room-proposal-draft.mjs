import { assessmentSections } from "./company-assessment-sections.mjs";
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
      "\n\nPhase 2 — Unpriced implementation candidates\nThese ideas are not included in the discovery estimate. Review quantities, access and scope before estimating implementation; proceed only after the owner approves it. Candidate improvements from the assessment:\n" +
      (section("improve what exists") ||
        "Scope improvements separately after discovery.") +
      "\n\nFinish — Verify and hand over\nDemonstrate the agreed checks for the discovery report, give the owner the instructions and account ownership needed to operate independently with their existing tools, and record acceptance of the diagnosis and plan. Additional work needs a separately approved project.",
    deliverables:
      "1. Discovery is complete when the owner receives verified findings, a baseline, a prioritized plan and a decision on which fixes to pursue.\n2. Check the report against its sources and clearly separate verified observations, assumptions and unanswered questions.\n3. Handoff includes operating instructions for using the findings, one report walkthrough, confirmation of existing customer account ownership and access, and a record of exclusions or unresolved items.\n4. Record the owner's acceptance and close the project. Implementation, changes to systems and training on new features are not discovery deliverables; they need a separately approved project. Ongoing service is not included.",
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
    pricing_basis: "Not estimated yet. Generate a client-specific work breakdown or enter tasks, hours, rate and assumptions before quoting.",
    items: [{description: "Scope and hours need review", quantity: 1, unit_cents: null, frequency: "once", optional: false}],
  };
}

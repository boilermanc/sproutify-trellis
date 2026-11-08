import {
  money,
  proposalTotals,
  validateProposal,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
export { draftProposal } from "../supabase/functions/_shared/project-room-proposal-draft.mjs";
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
    ["Internal work and hours breakdown", [
      "| Task | Hours or units | Rate | One-time total |",
      "| --- | --- | --- | --- |",
      ...proposal.items.map(i => `| ${i.optional ? "OPTIONAL — " : ""}${cell(i.description)} | ${i.quantity} ${i.estimate_unit === "hours" ? "hours" : "units"} | ${i.unit_cents === null ? "Unpriced" : money(i.unit_cents)} | ${i.unit_cents === null ? "Unpriced" : money(i.quantity * i.unit_cents)} |`),
      ...proposal.items.map(i => `\n**${i.description}**\n${i.basis || "Assumptions need review."}\n${i.evidence ? "Source: " + i.evidence : ""}`),
    ].join("\n")],
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

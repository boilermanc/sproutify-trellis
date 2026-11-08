import { sanitizePII } from "./project-room-sanitize.mjs";
export const SALES_STAGES = [
  "prospect",
  "discovery",
  "proposal_drafted",
  "proposal_sent",
  "won",
  "lost",
];
export const SALES_LABELS = {
  prospect: "Prospect",
  discovery: "Discovery",
  proposal_drafted: "Proposal drafted",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};
export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const clean = (value, max) => sanitizePII(value, max).trim();
export function validateProposal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Enter a proposal.");
  }
  const stage = input.stage;
  if (!SALES_STAGES.includes(stage)) throw new Error("Choose a sales stage.");
  const date = input.close_date || null;
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  ) throw new Error("Choose a valid expected close date.");
  if (
    !Array.isArray(input.items) || input.items.length < 1 ||
    input.items.length > 20
  ) throw new Error("Add between 1 and 20 fee items.");
  const items = input.items.map((item) => {
    const description = clean(item.description, 2000);
    if (!description) throw new Error("Describe each fee item.");
    if (item.frequency !== "once") {
      throw new Error("Projects use one-time fees. Remove recurring fee items before saving.");
    }
    if (
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      item.quantity > 10000
    ) throw new Error("Quantity must be a whole number from 1 to 10,000.");
    const unit_cents = item.unit_cents;
    if (
      unit_cents !== null &&
      (!Number.isSafeInteger(unit_cents) || unit_cents < 0 ||
        unit_cents > 100000000)
    ) {
      throw new Error(
        "Enter a valid price, or leave it blank for unpriced work.",
      );
    }
    if (unit_cents !== null && item.quantity * unit_cents > 1000000000) {
      throw new Error("A line item cannot exceed $10 million.");
    }
    return {
      description,
      quantity: item.quantity,
      unit_cents,
      frequency: item.frequency,
      optional: item.optional === true,
    };
  });
  const output = {
    schema_version: 1,
    stage,
    close_date: date,
    currency: "USD",
    pricing_basis: clean(input.pricing_basis, 2000),
    items,
  };
  for (
    const key of [
      "title",
      "objective",
      "scope",
      "deliverables",
      "timeline",
      "assumptions",
      "exclusions",
      "payment_terms",
      "next_step",
    ]
  ) output[key] = clean(input[key], key === "title" ? 180 : 16000);
  if (!output.title || !output.scope || !output.deliverables) {
    throw new Error("Add a proposal title, scope and deliverables.");
  }
  return output;
}
export function proposalTotals(proposal) {
  const totals = {
    once: 0,
    monthly: 0,
    unpriced: 0,
    optional_once: 0,
    optional_monthly: 0,
  };
  for (const item of proposal?.items || []) {
    if (item.unit_cents === null) {
      if (!item.optional) totals.unpriced++;
      continue;
    }
    totals[item.optional ? `optional_${item.frequency}` : item.frequency] +=
      item.quantity * item.unit_cents;
  }
  return totals;
}
export function proposalSummary(proposal) {
  return proposal
    ? {
      stage: proposal.stage,
      close_date: proposal.close_date,
      title: proposal.title,
      totals: proposalTotals(proposal),
    }
    : null;
}
export function saveProposal(
  room,
  input,
  actor,
  now = new Date().toISOString(),
) {
  if (room.kind !== "client") {
    throw new Error("Proposals belong to company projects.");
  }
  const draft = validateProposal(input);
  const previous = room.state.proposal;
  room.state.proposal = {
    ...draft,
    created_at: previous?.created_at || now,
    updated_at: now,
    updated_by: actor,
    source_summary: previous?.source_summary ?? room.state.summary ?? "",
  };
  return room.state.proposal;
}
export function pipelineTotals(rooms, clients) {
  const archived = new Set(
    clients.filter((c) => c.archived_at).map((c) => c.id),
  );
  const active = rooms.filter((r) =>
    r.kind === "client" && r.status !== "cancelled" &&
    !archived.has(r.client_id)
  );
  const open = active.filter((r) =>
    !["won", "lost"].includes(r.proposal?.stage || "prospect")
  );
  const sum = (rows, key) =>
    rows.reduce((n, r) => n + (r.proposal?.totals?.[key] || 0), 0);
  return {
    active,
    open,
    once: sum(open, "once"),
    monthly: sum(open, "monthly"),
    won_once: sum(active.filter((r) => r.proposal?.stage === "won"), "once"),
    unpriced:
      open.filter((r) => !r.proposal || r.proposal.totals.unpriced > 0).length,
  };
}

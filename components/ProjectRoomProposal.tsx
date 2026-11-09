import { invokeAI } from "../services/aiBackend";
import { estimateRequest, applyWorkEstimate, estimateChanges } from "../services/projectRoomEstimate.mjs";
import { proposalReviewRequest, readProposalReview, reworkIssues } from "../supabase/functions/_shared/project-room-proposal-review.mjs";
import React, { useEffect, useRef, useState } from "react";
import type { ProjectRoom, RoomProposal } from "../services/projectRoomService";
import {
  draftProposal,
  proposalDocx,
} from "../services/projectRoomProposal.mjs";
import {
  money,
  proposalTotals,
  SALES_LABELS,
  SALES_STAGES,
  validateProposal,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
const fields = [
  ["objective", "What success looks like"],
  ["scope", "Scope of work"],
  ["deliverables", "Completion checks and handoff"],
  ["timeline", "Schedule"],
  ["assumptions", "Assumptions and client responsibilities"],
  ["exclusions", "Not included"],
  ["payment_terms", "Payment schedule"],
  ["next_step", "Next step"],
] as const;
export default function ProjectRoomProposal(
  { room, onSave, onReview, onError }: {
    room: ProjectRoom;
    onSave: (proposal: RoomProposal, version: number) => Promise<boolean>;
    onReview: (version: number, includeImplementation: boolean) => Promise<boolean>;
    onError: (message: string) => void;
  },
) {
  const [draft, setDraft] = useState<RoomProposal | null>(
    room.state.proposal || null,
  );
  const [rate, setRate] = useState("150");
  const [implementationReviewed, setImplementationReviewed] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState<RoomProposal | null>(null);
  const latestRoom = useRef(room);
  latestRoom.current = room;
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(room.version);
  const [busy, setBusy] = useState(false);
  const editingId = useRef(room.id);
  useEffect(() => {
    if (editingId.current !== room.id || !dirty) {
      setImplementationReviewed(false);
      setPendingEstimate(null);
      editingId.current = room.id;
      setDraft(room.state.proposal || null);
      setBaseVersion(room.version);
      setDirty(false);
    }
  }, [room.id, room.version, dirty]);
  const edit = (patch: Partial<RoomProposal>) => {
    if (patch.scope !== undefined || patch.assumptions !== undefined || patch.exclusions !== undefined) setImplementationReviewed(false);
    setPendingEstimate(null);
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
  };
  const updateItem = (
    index: number,
    patch: Partial<RoomProposal["items"][number]>,
  ) =>
    edit({
      items: draft!.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    });
  const totals = proposalTotals(draft);
  const changes = pendingEstimate && draft ? estimateChanges(draft, pendingEstimate) : null;
  const hasRecurring = draft?.items.some((item) => item.frequency !== "once");
  async function estimate() {
    if (!draft) return;
    const requestRoom = room;
    const cents = Math.round(Number(rate) * 100);
    if (!Number.isFinite(Number(rate)) || cents <= 0 || cents > 1000000) { onError("Enter a valid hourly planning rate."); return; }
    setBusy(true);
    setPendingEstimate(null);
    try {
      const request = estimateRequest(room, draft, { discoveryOnly: !implementationReviewed });
      const response = await invokeAI(request.body);
      if (latestRoom.current.id !== requestRoom.id || latestRoom.current.version !== requestRoom.version) throw new Error("The room changed while estimating. Review the latest research and try again.");
      const estimated = applyWorkEstimate(draft, response.text, cents, request.evidence) as RoomProposal;
      const reviewResponse = await invokeAI(proposalReviewRequest(room, estimated, { discoveryOnly: !implementationReviewed }));
      if (latestRoom.current.id !== requestRoom.id || latestRoom.current.version !== requestRoom.version) throw new Error("The room changed during final review. Try again with the latest scope.");
      const review = readProposalReview(reviewResponse.text);
      if (review.status !== "passed") throw new Error("Chief of staff found issues: " + review.issues.join(" "));
      setPendingEstimate(estimated);
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      const valid = validateProposal(draft) as RoomProposal;
      if (await onSave(valid, baseVersion)) setDirty(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!draft) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(await proposalDocx(room, draft));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${
        room.title.replace(/[^a-z0-9]/gi, "-")
      }-proposal-guide.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      onError("The proposal download did not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!draft) {
    return (
      <section className="pr-panel">
        <h2>Turn this research into a proposal</h2>
        {room.state.proposal_generation && <p role="status" className="pr-muted">
          {room.state.proposal_generation.status === "running" && room.busy
            ? "Preparing your proposal and pricing draft. Refresh the room shortly."
            : "Research is saved. Automatic drafting did not finish; create a draft below and estimate the work for review."}
        </p>}
        <p className="pr-muted">
          Create an editable internal guide with scope, deliverables, estimated
          fees and suggested terms. It will not be sent to the customer.
        </p>
        <button
          className="pr-button pr-primary"
          disabled={!room.state.summary || busy || room.busy}
          onClick={() => {
            setDraft(draftProposal(room) as RoomProposal);
            setBaseVersion(room.version);
            setDirty(true);
          }}
        >
          Generate proposal draft
        </button>
        {!room.state.summary && <p>Complete a research summary first.</p>}
      </section>
    );
  }
  return (
    <div className="pr-stack pr-proposal">
      {room.state.proposal_generation?.review?.status === "needs_review" && <section className="pr-panel" aria-label="Chief of staff review">
        <h2>Needs rework — Chief of staff found issues</h2>
        <p>Pricing is held back. Correct these issues, save the draft, then run the chief’s final review again.</p>
        <ul>{reworkIssues(room.state.proposal_generation.review).map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        <h3>Input needed from you or Sheree</h3>
        {room.state.proposal_generation.review.input_needed?.length
          ? <ul>{room.state.proposal_generation.review.input_needed.map((question, index) => <li key={index}>{question}</li>)}</ul>
          : <p>No additional input was requested. Start with the corrections above.</p>}
      </section>}
      <section className="pr-panel">
        <div className="pr-top">
          <div>
            <h2>Proposal & pricing</h2>
            <p>
              Internal planning guide. Review estimates before making a customer
              offer.
            </p>
          </div>
          <div className="pr-actions">
            <button className="pr-button" disabled={busy || room.busy || dirty || !room.state.proposal} onClick={async () => {
              setBusy(true);
              try { await onReview(baseVersion, implementationReviewed); } finally { setBusy(false); }
            }}>Run chief final review</button>
            <button
              className="pr-button pr-primary"
              disabled={busy || room.busy}
              onClick={save}
            >
              {busy ? "Working…" : "Save proposal"}
            </button>
            <button
              className="pr-button"
              disabled={busy || dirty || hasRecurring || !room.state.proposal}
              onClick={download}
            >
              Download proposal Word
            </button>
          </div>
        </div>
        {dirty && (
          <p role="status">
            Unsaved changes. Save to update the pipeline and download.
          </p>
        )}
        {draft.source_summary && draft.source_summary !== room.state.summary &&
          (
            <p className="pr-archive-message">
              Research has changed since this proposal was created. Review the
              new findings and update this draft before using it.
            </p>
          )}
        <div className="pr-proposal-grid">
          <label className="pr-field">
            Proposal title<input
              value={draft.title}
              maxLength={180}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </label>
          <label className="pr-field">
            Sales stage<select
              value={draft.stage}
              onChange={(e) => edit({ stage: e.target.value })}
            >
              {SALES_STAGES.map((stage) => (
                <option key={stage} value={stage}>{SALES_LABELS[stage]}</option>
              ))}
            </select>
          </label>
          <label className="pr-field">
            Expected close date<input
              type="date"
              value={draft.close_date || ""}
              onChange={(e) => edit({ close_date: e.target.value || null })}
            />
          </label>
        </div>
      </section>
      <section className="pr-panel">
        <h2>The outcome and the finish line</h2>
        <div className="pr-stack">
          {fields.map(([key, label]) => (
            <label className="pr-field" key={key}>
              {label}
              <textarea
                rows={key === "scope" ? 8 : 4}
                maxLength={16000}
                value={draft[key]}
                onChange={(e) => edit({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button
          className="pr-button pr-primary"
          disabled={busy || room.busy}
          onClick={save}
        >
          Save proposal
        </button>
      </section>
      <section className="pr-panel">
        <h2>One-time project investment</h2>
        <p>Included estimated hours: {draft.items.filter(i => i.estimate_unit === "hours" && !i.optional).reduce((n,i)=>n+i.quantity,0)} · Optional estimated hours: {draft.items.filter(i => i.estimate_unit === "hours" && i.optional).reduce((n,i)=>n+i.quantity,0)}. Legacy fixed-fee items do not imply an hour estimate.</p>
        <p>Estimate this client's tasks, then review the hours and assumptions before quoting. An estimate and a final chief of staff review use two AI requests outside the research-round budget. It does not save or approve a price automatically.</p>
        <label className="pr-field">Suggested planning rate (USD/hour; not approved)<input type="number" min="0.01" max="10000" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></label>
        <p>Start with discovery. Implementation ideas stay unpriced until you define the work and quantities in Scope of work.</p>
        <label className="pr-check"><input type="checkbox" checked={implementationReviewed} disabled={busy || room.busy} onChange={e => { setImplementationReviewed(e.target.checked); setPendingEstimate(null); }} /> I reviewed the implementation scope and want it estimated too</label>
        <button className="pr-button" disabled={busy || room.busy || !room.state.summary} onClick={estimate}>{busy ? "Working…" : "Estimate work from this client's research"}</button>
        {pendingEstimate && <section className="pr-panel" aria-label="Estimate preview">
          <h3>Review proposed work and hours</h3>
          <p>Chief of staff final checks passed. Your review is still required before quoting.</p>
          <p><strong>Proposed included work: {pendingEstimate.items.filter(i => !i.optional).reduce((n,i)=>n+i.quantity,0)} hours · {money(proposalTotals(pendingEstimate).once)}</strong></p>
          <p><strong>Proposed optional work: {pendingEstimate.items.filter(i => i.optional).reduce((n,i)=>n+i.quantity,0)} hours · {money(proposalTotals(pendingEstimate).optional_once)}</strong></p>
          {changes?.hasBaseline && <section aria-label="Changes from current estimate">
            <h3>What changed from your current estimate?</h3>
            <p>Current: {changes.before.hours} hours · {money(changes.before.cents)}. Proposed: {changes.after.hours} hours · {money(changes.after.cents)}. Change: {changes.after.hours - changes.before.hours} hours · {money(changes.after.cents - changes.before.cents)}. These totals include optional work.</p>
            <ul>{changes.lines.map((line: string, index: number) => <li key={index}>{line}</li>)}</ul>
          </section>}
          <p>When implementation is optional, its testing and final handoff stay optional too. Uncertain risks remain unpriced. Review the task boundaries and change reasons. Source references support the scope, not the number of hours. Check the schedule against any changed hours before saving.</p>
          <p>Applying replaces fee items and estimating notes. It keeps your scope and other proposal edits.</p>
          {pendingEstimate.items.map((item, i) => <p key={i}><strong>{item.optional ? "Optional: " : ""}{item.description}</strong><br />{item.quantity} hours × {money(item.unit_cents!)} = {money(item.quantity * item.unit_cents!)}<br />{item.basis}<br />Source: {item.evidence}</p>)}
          <button className="pr-button pr-primary" onClick={() => { edit({items: pendingEstimate.items, pricing_basis: pendingEstimate.pricing_basis, ...(draft.objective.startsWith("After the agreed work") ? {objective: pendingEstimate.objective} : {})}); setPendingEstimate(null); }}>Use estimated breakdown</button>
          <button className="pr-button" onClick={() => setPendingEstimate(null)}>Discard estimate</button>
        </section>}
        {hasRecurring && <p role="alert">This older draft contains recurring fees. Remove those fee items and review the scope before saving or downloading.</p>}
        <p>
          USD. These are proposed customer fees, not our internal costs or
          revenue collected. Optional fees stay outside the main pipeline
          totals.
        </p>
        <div className="pr-metrics">
          <div className="pr-metric">
            <b>{money(totals.once)}</b>
            <span>Priced one-time fees</span>
          </div>

        </div>
        {totals.unpriced > 0 && (
          <p role="status">
            {totals.unpriced}{" "}
            included item(s) still need pricing. Totals are partial.
          </p>
        )}
        {draft.items.map((item, i) => (
          <fieldset className="pr-fee-item" key={i}>
            <legend>Fee item {i + 1}</legend>
            <label className="pr-field">
              Description<input
                maxLength={2000}
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
              />
            </label>
            <div className="pr-proposal-grid">
              <label className="pr-field">
                {item.estimate_unit === "hours" ? "Estimated hours" : "Quantity (legacy fixed fee or manual units)"}<input
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(i, { quantity: Number(e.target.value) })}
                />
              </label>
              <label className="pr-field">
                {item.estimate_unit === "hours" ? "Hourly rate (USD)" : "Project or unit fee (USD)"}<input
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  placeholder="Not priced"
                  value={item.unit_cents === null ? "" : item.unit_cents / 100}
                  onChange={(e) =>
                    updateItem(i, {
                      unit_cents: e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 100),
                    })}
                />
              </label>

            </div>
            <label className="pr-field">Assumptions and reason for hours<textarea value={item.basis || ""} maxLength={3000} onChange={e => updateItem(i, {basis:e.target.value})} /></label>
            <label className="pr-field">Source evidence<textarea value={item.evidence || ""} maxLength={2000} onChange={e => updateItem(i, {evidence:e.target.value})} /></label>
            <div className="pr-actions">
              <label>
                <input
                  type="checkbox"
                  checked={item.optional}
                  onChange={(e) =>
                    updateItem(i, { optional: e.target.checked })}
                />{" "}
                Optional work
              </label>
              <strong>
                {item.unit_cents === null
                  ? "To be priced"
                  : money(item.quantity * item.unit_cents)}
                {item.frequency === "monthly" ? " / month" : ""}
              </strong>
              <button
                className="pr-button"
                disabled={draft.items.length <= 1}
                onClick={() =>
                  edit({ items: draft.items.filter((_, n) => n !== i) })}
              >
                Remove fee item {i + 1}
              </button>
            </div>
          </fieldset>
        ))}
        <button
          className="pr-button"
          disabled={draft.items.length >= 20}
          onClick={() =>
            edit({
              items: [...draft.items, {
                description: "",
                estimate_unit: "hours",
                quantity: 1,
                unit_cents: null,
                frequency: "once",
                optional: false,
              }],
            })}
        >
          Add fee item
        </button>
        <label className="pr-field">
          Internal estimating notes<textarea
            rows={4}
            maxLength={2000}
            value={draft.pricing_basis}
            onChange={(e) => edit({ pricing_basis: e.target.value })}
          />
        </label>
      </section>

    </div>
  );
}

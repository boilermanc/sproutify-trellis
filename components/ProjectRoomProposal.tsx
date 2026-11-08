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
  ["objective", "Business objective"],
  ["scope", "Scope of work"],
  ["deliverables", "Deliverables and acceptance"],
  ["timeline", "Schedule"],
  ["assumptions", "Assumptions and client responsibilities"],
  ["exclusions", "Not included"],
  ["payment_terms", "Payment schedule"],
  ["next_step", "Next step"],
] as const;
export default function ProjectRoomProposal(
  { room, onSave, onError }: {
    room: ProjectRoom;
    onSave: (proposal: RoomProposal, version: number) => Promise<boolean>;
    onError: (message: string) => void;
  },
) {
  const [draft, setDraft] = useState<RoomProposal | null>(
    room.state.proposal || null,
  );
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(room.version);
  const [busy, setBusy] = useState(false);
  const editingId = useRef(room.id);
  useEffect(() => {
    if (editingId.current !== room.id || !dirty) {
      editingId.current = room.id;
      setDraft(room.state.proposal || null);
      setBaseVersion(room.version);
      setDirty(false);
    }
  }, [room.id, room.version, dirty]);
  const edit = (patch: Partial<RoomProposal>) => {
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
            <button
              className="pr-button pr-primary"
              disabled={busy || room.busy}
              onClick={save}
            >
              {busy ? "Working…" : "Save proposal"}
            </button>
            <button
              className="pr-button"
              disabled={busy || dirty || !room.state.proposal}
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
        <h2>Fees and cost structure</h2>
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
          <div className="pr-metric">
            <b>{money(totals.monthly)}</b>
            <span>Priced monthly fees</span>
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
                Hours or units<input
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
                Fee per unit (USD)<input
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
              <label className="pr-field">
                Frequency<select
                  value={item.frequency}
                  onChange={(e) =>
                    updateItem(i, {
                      frequency: e.target.value as "once" | "monthly",
                    })}
                >
                  <option value="once">One-time</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
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
          Pricing assumptions<textarea
            rows={4}
            maxLength={2000}
            value={draft.pricing_basis}
            onChange={(e) => edit({ pricing_basis: e.target.value })}
          />
        </label>
      </section>
      <section className="pr-panel">
        <h2>Proposal details</h2>
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
    </div>
  );
}

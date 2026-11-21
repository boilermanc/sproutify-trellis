import React, { useEffect, useState } from "react";
import type {
  CustomerDocument,
  ProjectRoom,
} from "../services/projectRoomService";
import {
  CUSTOMER_FIELDS,
  customerSourceKey,
} from "../supabase/functions/_shared/project-room-customer-document.mjs";
import {
  customerDocumentDocx,
  customerDocumentPdf,
} from "../services/customerDocument.mjs";
export default function ProjectRoomCustomerDocuments(
  { room, onAction, onError }: {
    room: ProjectRoom;
    onAction: (
      action: string,
      input: Record<string, unknown>,
    ) => Promise<boolean>;
    onError: (message: string) => void;
  },
) {
  const [creating, setCreating] = useState(false),
    [kind, setKind] = useState("assessment"),
    [analysis, setAnalysis] = useState(""),
    [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [content, setContent] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [sourceKey, setSourceKey] = useState(""),
    [baseVersion, setBaseVersion] = useState(room.version);
  const docs = room.state.customer_documents || [],
    doc = docs.find((d) => d.id === selected),
    stale = !!doc && doc.source_key !== sourceKey;
  useEffect(() => {
    let live = true;
    setSourceKey("");
    customerSourceKey(room).then((key) => {
      if (live) setSourceKey(key);
    });
    return () => {
      live = false;
    };
  }, [room]);
  useEffect(() => {
    setCreating(false);
    setSelected("");
    setDirty(false);
    setConfirmed(false);
    setReviewed(false);
  }, [room.id]);
  async function act(action: string, input: Record<string, unknown>) {
    setBusy(true);
    try {
      if (await onAction(action, { ...input, version: baseVersion })) {
        setDirty(false);
        setReviewed(false);
        setCreating(false);
        setSelected("");
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(d: CustomerDocument) {
    setSelected(d.id);
    setContent({ ...d.content });
    setDirty(false);
    setReviewed(false);
    setBaseVersion(room.version);
    setCreating(false);
  }
  function edit(key: string, value: string) {
    setContent({ ...content, [key]: value });
    setDirty(true);
    setReviewed(false);
  }
  async function download(format: "docx" | "pdf") {
    if (!doc) return;
    setBusy(true);
    try {
      if (doc.status === "approved" && stale) {
        throw new Error(
          "Create a fresh draft from the changed analysis before downloading an approved copy.",
        );
      }
      const blob = await (format === "docx"
        ? customerDocumentDocx(doc)
        : customerDocumentPdf(doc));
      const url = URL.createObjectURL(blob as Blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${
        doc.content.title.replace(/[^a-z0-9]/gi, "-")
      }-customer-${doc.kind}-${doc.status}.${format}`;
      a.click();
      setTimeout(() =>
        URL.revokeObjectURL(url), 1000);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pr-panel" aria-label="Customer documents">
      <div className="pr-top">
        <div>
          <h2>Customer documents</h2>
          <p>
            Review the analysis first. Create a customer draft when you are
            ready.
          </p>
        </div>
        <button
          className="pr-button pr-primary"
          disabled={busy || room.busy || room.status === "running" ||
            !room.state.summary}
          onClick={() => {
            setCreating(true);
            setSelected("");
            setAnalysis(room.state.summary);
            setNote("");
            setConfirmed(false);
            setBaseVersion(room.version);
          }}
        >
          Create customer document
        </button>
      </div>
      <p className="pr-muted">
        Nothing is created automatically or sent. Your internal proposal stays
        unchanged.
      </p>
      {creating && (
        <div className="pr-stack">
          <label className="pr-field">
            Document type<select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="assessment">
                Opportunity assessment — no prices
              </option>
              <option value="proposal">
                Project proposal — reviewed one-time price
              </option>
            </select>
          </label>
          {room.state.proposal_generation?.review?.status === "needs_review" &&
            (
              <p role="status">
                The chief has unresolved findings. Explain how they should be
                presented below. A priced proposal must wait until pricing
                passes review.
              </p>
            )}
          <label className="pr-field">
            Analysis to use<textarea
              aria-label="Analysis to use"
              rows={10}
              maxLength={60000}
              value={analysis}
              onChange={(e) => {
                setAnalysis(e.target.value);
                setConfirmed(false);
              }}
            />
            <span>Keep supporting links and material qualifications.</span>
          </label>
          <label className="pr-field">
            Your direction<textarea
              aria-label="Your direction"
              rows={3}
              maxLength={3000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setConfirmed(false);
              }}
              placeholder="What should we recommend? How should unresolved findings be explained?"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I reviewed this analysis and approve using it for a customer
            draft{kind === "proposal"
              ? ", including the saved one-time prices"
              : ""}.
          </label>
          <div className="pr-actions">
            <button
              className="pr-button pr-primary"
              disabled={!confirmed || busy || room.busy ||
                room.version !== baseVersion}
              onClick={() =>
                act("customer_document_create", {
                  kind,
                  analysis,
                  approval_note: note,
                  analysis_approved: confirmed,
                })}
            >
              {busy ? "Creating draft…" : "Build customer draft"}
            </button>
            <button
              className="pr-button"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
          {room.version !== baseVersion && (
            <p role="alert">
              The room changed. Close this form and review the latest analysis.
            </p>
          )}
        </div>
      )}
      {!!docs.length && (
        <div className="pr-stack">
          <h3>Saved customer documents</h3>
          {[...docs].reverse().map((d) => (
            <button
              className="pr-button"
              key={d.id}
              disabled={busy}
              onClick={() => open(d)}
            >
              {d.content.title} ·{" "}
              {d.kind === "assessment" ? "Assessment" : "Proposal"} ·{" "}
              {d.status === "approved" ? "Approved" : "Draft"} ·{" "}
              {new Date(d.created_at).toLocaleDateString()}
            </button>
          ))}
        </div>
      )}
      {doc && (
        <div className="pr-stack">
          <h3>
            {doc.status === "approved"
              ? "Approved customer document"
              : "Draft for you and Sheree to review"}
          </h3>
          {stale && (
            <p role="status">
              Analysis or pricing changed. Create a new draft before approving
              it.
            </p>
          )}
          <label className="pr-field">
            Customer document title<input
              value={content.title || ""}
              maxLength={180}
              onChange={(e) => edit("title", e.target.value)}
            />
          </label>
          {Object.entries(CUSTOMER_FIELDS).map(([key, label]) => (
            <label className="pr-field" key={key}>
              {label}
              <textarea
                aria-label={label}
                rows={4}
                maxLength={6000}
                value={content[key] || ""}
                onChange={(e) =>
                  edit(key, e.target.value)}
              />
            </label>
          ))}
          {doc.pricing && (
            <div>
              <h4>One-time investment</h4>
              {doc.pricing.items.map((i: any, index: number) => (
                <p key={index}>
                  {i.description}
                  {i.optional ? " (optional)" : ""}: ${(i.amount_cents / 100)
                    .toFixed(2)}
                </p>
              ))}
              <p>
                Included total: ${(doc.pricing.total_cents / 100).toFixed(2)}.
                Optional work excluded.
              </p>
            </div>
          )}
          <div className="pr-actions">
            <button
              className="pr-button"
              disabled={busy || room.busy || !dirty}
              onClick={() =>
                act("customer_document_save", { document_id: doc.id, content })}
            >
              Save document edits
            </button>
            <button
              className="pr-button"
              disabled={busy || dirty || (doc.status === "approved" && stale)}
              onClick={() => download("docx")}
            >
              Download customer Word
            </button>
            <button
              className="pr-button"
              disabled={busy || dirty || (doc.status === "approved" && stale)}
              onClick={() => download("pdf")}
            >
              Download customer PDF
            </button>
          </div>
          {dirty && (
            <p>
              Save edits before downloading. Editing returns the document to
              draft.
            </p>
          )}
          {doc.status === "draft" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  disabled={dirty || stale}
                />{" "}
                I reviewed the complete customer document, its limits, and any
                prices.
              </label>
              <button
                className="pr-button pr-primary"
                disabled={!reviewed || dirty || stale || busy || room.busy}
                onClick={() =>
                  act("customer_document_approve", {
                    document_id: doc.id,
                    confirmed: reviewed,
                  })}
              >
                Approve customer document
              </button>
            </>
          )}
          {doc.status === "approved" && (
            <p>
              Approved{" "}
              {new Date(doc.approved_at!).toLocaleDateString()}. Nothing has
              been sent.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

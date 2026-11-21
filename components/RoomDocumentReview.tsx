import React, { useState } from "react";
import ProjectRoomDocuments from "./ProjectRoomDocuments";
import type { ProjectRoom } from "../services/projectRoomService";
import type { RoomDocument } from "../services/projectRoomDocuments";
export default function RoomDocumentReview({
  room,
  busy,
  onSave,
}: {
  room: ProjectRoom;
  busy: boolean;
  onSave: (docs: RoomDocument[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [documents, setDocuments] = useState(room.state.documents || []);
  const [extracting, setExtracting] = useState(false);
  const latest = room.state.rounds.at(-1);
  const editable = ["draft", "awaiting_user"].includes(room.status);
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-6">
      <h3 className="font-bold text-[#102b4e]">Supporting documents</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Only extracted text enters the provider packet here. Save originals
        separately under Original project files above. Document text is frozen for each
        round so independent reviewers receive the same version.
      </p>
      {(room.state.documents || []).map((doc) => (
        <div key={doc.sha256} className="mt-3 border-l-2 border-blue-300 pl-3">
          <p className="text-sm font-semibold text-slate-700">{doc.name}</p>
          <p className="text-xs text-slate-500">
            {doc.text.length.toLocaleString()} characters ·{" "}
            {doc.truncated ? "Partial excerpt · " : ""}
            {latest?.documents?.some((d) => d.sha256 === doc.sha256)
              ? `Included in round ${latest.number} handoff packet`
              : "Not sent to providers yet"}
          </p>
        </div>
      ))}
      {!room.state.documents?.length && (
        <p className="mt-3 text-sm text-slate-500">No documents added.</p>
      )}
      {editable && (
        <button
          className="mt-4 rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-900"
          disabled={busy}
          onClick={() => setEditing(!editing)}
        >
          {editing
            ? "Close document editor"
            : "Add or change next-round documents"}
        </button>
      )}
      {editing && (
        <div className="mt-5">
          <ProjectRoomDocuments
            documents={documents}
            onChange={setDocuments}
            onBusyChange={setExtracting}
            disabled={busy}
          />
          <button
            className="mt-4 rounded-xl bg-[#102b4e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            disabled={
              busy || extracting || documents.some((d) => !d.share_consent)
            }
            onClick={() => onSave(documents)}
          >
            Save private document text
          </button>
        </div>
      )}
      {!editable && room.status !== "cancelled" && (
        <p className="mt-4 text-xs text-slate-500">
          Finish this round before changing the documents for the next pass.
        </p>
      )}
    </section>
  );
}

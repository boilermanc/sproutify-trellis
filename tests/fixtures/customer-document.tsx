import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ProjectRoomCustomerDocuments from "../../components/ProjectRoomCustomerDocuments";
import {
  addCustomerDocument,
  customerDocumentRequest,
  updateCustomerDocument,
} from "../../supabase/functions/_shared/project-room-customer-document.mjs";
import { acaCustomerContent } from "./aca-customer-document.mjs";
import "../../pages/ProjectRooms.css";
import "../../index.css";
function Preview() {
  const [room, setRoom] = useState<any>({
    id: "preview",
    kind: "client",
    title: "ACA Landscaping",
    status: "awaiting_user",
    version: 1,
    state: {
      summary: "Reviewed public findings: " + acaCustomerContent.findings +
        "\n\n" + acaCustomerContent.limits,
      notes: [],
      decisions: [],
      proposal_generation: {
        status: "needs_review",
        review: { status: "needs_review", issues: ["Instagram unverified"] },
      },
    },
  });
  const [error, setError] = useState("");
  return (
    <main
      className="project-rooms"
      style={{ maxWidth: 1100, margin: "auto", padding: 24 }}
    >
      <h1>ACA customer document preview</h1>
      <p>Local preview only. No live room changes or provider calls.</p>
      {error && <p role="alert">{error}</p>}
      <ProjectRoomCustomerDocuments
        room={room}
        onError={setError}
        onAction={async (action, input) => {
          setError("");
          const copy = structuredClone(room);
          if (input.version !== room.version) throw new Error("Room changed");
          if (action === "customer_document_create") {
            const request = await customerDocumentRequest(copy, input);
            addCustomerDocument(copy, request, input.kind, {
              text: JSON.stringify(acaCustomerContent),
              model: "curated-preview",
            }, "preview-clint");
          } else {await updateCustomerDocument(
              copy,
              { ...input, action },
              "preview-sheree",
            );}
          copy.version++;
          setRoom(copy);
          return true;
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);

import { saveProposal, proposalSummary } from "../../supabase/functions/_shared/project-room-proposal.mjs";
// Local, synthetic UI fixture. No provider or Supabase requests leave this page.
import React from "react";
import { createRoot } from "react-dom/client";
import ProjectRooms from "../../pages/ProjectRooms";
import { assessmentFixture } from "./company-assessment.mjs";
import {
  createRoom,
  nextRound,
  importOutput,
  handoff,
  exportRoom,
} from "../../supabase/functions/_shared/project-room.mjs";
import "../../index.css";
import { validateDocuments } from "../../supabase/functions/_shared/project-room-intake.mjs";
import { planAeoSearch, summarizeAeoAnswer, updateAeo } from "../../supabase/functions/_shared/project-room-aeo.mjs";
const fixtureParams = new URL(location.href).searchParams;
let room: any =
  fixtureParams.get("scenario") === "report"
    ? assessmentFixture()
    : null;
const original = window.fetch;
const client: any = {id: "fixture-client", name: "Example Company", status: "prospect", version: 1, archived_at: null, follow_up_date: null};
const members: any[] = [{user_id: "clint", name: "Clint", role: "owner"}];
if (room) { room.client_id = client.id; room.member_role = "owner"; }
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/functions/v1/ai-generate")) {
    return new Response(JSON.stringify({text: JSON.stringify({objective:"The owner can run the improved enquiry process independently.", assumptions:"Synthetic estimate for browser testing.", tasks:[
      {description:"Confirm enquiry workflow with owner", hours:2, phase:"discovery", optional:false, basis:"One owner interview and notes.", evidence:"Review the existing findings with the owner"},
      {description:"Verify agreed changes", hours:1, phase:"testing", optional:true, basis:"One acceptance pass.", evidence:"Demonstrate the agreed checks"},
      {description:"Owner walkthrough", hours:1, phase:"handoff", optional:true, basis:"One walkthrough and instructions.", evidence:"operate independently"}
    ]})}),{status:200,headers:{"Content-Type":"application/json"}});
  }
  if (url.includes("/functions/v1/project-rooms")) {
    const b = JSON.parse(String(init?.body));
    let result: any;
    try {
      if (b.action === "list")
        result = {
          rooms: room ? [{...room, proposal: proposalSummary(room.state.proposal)}] : [],
          clients: room ? [client] : [],
          connections: {
            research: true,
            openai: false,
            anthropic: false,
            chief: true,
          },
        };
      else if (b.action === "create") {
        room = { ...createRoom(b), id: crypto.randomUUID(), version: 1, member_role: "owner", ...(b.kind === "client" ? {client_id: client.id} : {}) };
        if (b.kind === "client" && !b.client_id) client.name = b.intake.name;
        result = { room };
      } else if (b.action === "client_update") {
        if (b.client_version !== client.version) throw new Error("Company changed. Refresh and try again.");
        Object.assign(client, {status: b.status, archived_at: b.archived ? new Date().toISOString() : null, follow_up_date: b.follow_up_date, follow_up_note: b.follow_up_note, archive_reason: b.archive_reason, version: client.version + 1});
        result = {client};
      } else if (b.action === "members") {
        result = {members, operators: [{user_id: "clint", name: "Clint"}, {user_id: "sheree", name: "Sheree"}]};
      } else if (b.action === "share" || b.action === "unshare") {
        if (b.version !== room.version) throw new Error("Room changed. Refresh and try again.");
        if (b.action === "share") members.push({user_id: b.user_id, name: "Sheree", role: "member"});
        else members.splice(members.findIndex(m => m.user_id === b.user_id), 1);
        room.version++; result = {room};
      } else if (b.action === "search_client_data") {
        result = {results: [{room_id: room.id, room_title: room.title, source: "Company notes", snippet: "Discuss website improvements at the next meeting."}]};
      } else if (b.action === "handoff")
        result = { markdown: handoff(room, b.role) };
      else if (b.action === "export") result = { markdown: exportRoom(room) };
      else if (b.action === "get") result = { room };
      else {
        if (b.version !== room.version)
          throw new Error("Room changed. Refresh and try again.");
        if (b.action === "proposal_save") saveProposal(room,b.proposal,"clint");
        if (b.action === "start" || b.action === "next_round") {
          const round = nextRound(room);
          if (fixtureParams.has("automatic-aeo")) {
            const run = planAeoSearch(room, true);
            if (run?.status === "running") {
              const at = new Date().toISOString();
              Object.assign(round, { aeo_search: {
                ...run,
                status: "finished",
                results: run.questions.map((_, index) => summarizeAeoAnswer(index === 0 ? {
                  status: "completed",
                  output: [
                    { type: "web_search_call", status: "completed", action: { type: "search" } },
                    { type: "message", role: "assistant", content: [{
                      type: "output_text",
                      text: `- **${room.title}** — local option\n- **Another Painter** — alternative`,
                      annotations: [{ type: "url_citation", title: "Local options", url: "https://example.org/options" }],
                    }] },
                  ],
                } : null, { name: room.title }, index, at)),
              } });
            }
          }
        }
        if (b.action === "pause") room.status = "paused";
        if (b.action === "resume") room.status = "running";
        if (b.action === "cancel") room.status = "cancelled";
        if (b.action === "import_meeting") room.state.meetings = [...(room.state.meetings || []), b.meeting];
        if (b.action === "note")
          room.state.notes.push({ text: b.text, at: new Date().toISOString() });
        if (b.action === "documents")
          room.state.documents = validateDocuments(b.documents);
        if (b.action === "aeo") updateAeo(room, b, "fixture-user");
        if (b.action === "import") {
          importOutput(room, b.role, b.text, "fixture-user");
          if (room.status !== "awaiting_user") room.status = "paused";
        }
        if (b.action === "decision")
          room.state.decisions.find((d: any) => d.id === b.decision_id).status =
            b.status;
        room.version++;
        result = { room };
      }
      return Response.json(result);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (!url.startsWith("/") && !url.startsWith(location.origin))
    throw new Error("Non-local network blocked by fixture.");
  return original(input, init);
};
createRoot(document.getElementById("root")!).render(
  <>
    <div className="bg-amber-100 p-3 text-center text-sm">
      Synthetic UI fixture · no live provider calls
    </div>
    <ProjectRooms addToast={() => {}} />
  </>,
);

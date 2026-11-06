// Local, synthetic UI fixture. No provider or Supabase requests leave this page.
import React from "react";
import { createRoot } from "react-dom/client";
import ProjectRooms from "../../pages/ProjectRooms";
import {
  createRoom,
  nextRound,
  importOutput,
  handoff,
  exportRoom,
} from "../../supabase/functions/_shared/project-room.mjs";
import "../../index.css";
let room: any = null;
const original = window.fetch;
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/functions/v1/project-rooms")) {
    const b = JSON.parse(String(init?.body));
    let result: any;
    try {
      if (b.action === "list")
        result = {
          rooms: room ? [room] : [],
          connections: {
            research: true,
            openai: false,
            anthropic: false,
            chief: true,
          },
        };
      else if (b.action === "create") {
        room = { ...createRoom(b), id: crypto.randomUUID(), version: 1 };
        result = { room };
      } else if (b.action === "handoff")
        result = { markdown: handoff(room, b.role) };
      else if (b.action === "export") result = { markdown: exportRoom(room) };
      else if (b.action === "get") result = { room };
      else {
        if (b.version !== room.version)
          throw new Error("Room changed. Refresh and try again.");
        if (b.action === "start" || b.action === "next_round") nextRound(room);
        if (b.action === "pause") room.status = "paused";
        if (b.action === "resume") room.status = "running";
        if (b.action === "cancel") room.status = "cancelled";
        if (b.action === "note")
          room.state.notes.push({ text: b.text, at: new Date().toISOString() });
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

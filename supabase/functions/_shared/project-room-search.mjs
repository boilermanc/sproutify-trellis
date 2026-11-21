import { sanitizePII } from "./project-room-sanitize.mjs";

// Callers must supply only rooms the signed-in operator can access.
// This is literal evidence retrieval; it never executes instructions in notes.
export function searchRoomEvidence(rooms, query) {
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 200) {
    throw new Error("Enter a search of 2 to 200 characters.");
  }
  const terms = [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
  if (!terms.length) throw new Error("Enter a word to search for.");
  const matches = [];
  let limited = rooms.length > 50;
  for (const room of rooms.slice(0, 50)) {
    const state = room.state || {};
    const sources = [
      ["Company briefing", room.brief],
      ["Room summary", state.summary],
      ...(state.notes || []).map(n => ["Team note", n.text]),
      ...(state.decisions || []).map(n => ["Decision", n.text]),
      ...(state.questions || []).map(n => ["Open question", n]),
      ...(state.meetings || []).map(n => [`Meeting: ${n.title}`, n.summary]),
      ...(state.documents || []).map(n => [`Document: ${n.name || n.title || "Uploaded document"}`, n.text]),
      ...(state.rounds || []).flatMap(r => Object.entries(r.outputs || {}).map(([role, out]) => [`Round ${r.number}: ${role}`, out.text])),
    ];
    for (const [source, value] of sources) {
      if (typeof value !== "string" || !value) continue;
      const clean = sanitizePII(value, 100000);
      const lower = clean.toLocaleLowerCase();
      if (!terms.every(term => lower.includes(term))) continue;
      const first = Math.min(...terms.map(term => lower.indexOf(term)));
      const start = Math.max(0, first - 100);
      const end = Math.min(clean.length, start + 600);
      if (matches.length === 20) { limited = true; continue; }
      matches.push({ room_id: room.id, title: sanitizePII(room.title, 200), source: sanitizePII(source, 240),
        text: `${start ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}` });
    }
  }
  return { matches, limited };
}

import { sanitizePII } from "./project-room-sanitize.mjs";

const MAX_NOTES = 100;
const MAX_SUMMARY = 24000;

export function normalizeMeetingNote(input) {
  if (!input || typeof input !== "object") throw new Error("Choose a meeting note to save.");
  if (input.source !== "chatgpt_meetings" && input.source !== "manual") {
    throw new Error("Choose ChatGPT Meetings or pasted notes as the source.");
  }
  const sourceId = String(input.source_id || "").trim();
  if (!sourceId || sourceId.length > 256 || /[\u0000-\u001f]/.test(sourceId)) {
    throw new Error("The meeting needs a valid source reference.");
  }
  const title = String(input.title || "").trim();
  const summary = String(input.summary || "").trim();
  if (!title || title.length > 200) throw new Error("Give the meeting a title of up to 200 characters.");
  if (!summary || summary.length > MAX_SUMMARY) {
    throw new Error("Add meeting notes of up to 24,000 characters.");
  }
  const started = String(input.started_at || "");
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(started) ||
    !Number.isFinite(Date.parse(started))) {
    throw new Error("Choose a meeting date and time with its timezone.");
  }
  let sourceUrl = null;
  if (input.source_url) {
    const url = new URL(String(input.source_url));
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) {
      throw new Error("The source link must be a secure web address.");
    }
    sourceUrl = url.href;
  }
  return {
    source: input.source,
    source_id: sourceId,
    title: sanitizePII(title, 200),
    started_at: new Date(started).toISOString(),
    summary: sanitizePII(summary, MAX_SUMMARY),
    source_url: sourceUrl,
  };
}

// The caller must enforce room membership and optimistic version checks.
export function attachMeetingNote(room, input, actor, now = new Date().toISOString()) {
  const note = normalizeMeetingNote(input);
  const meetings = room.state.meetings || [];
  const index = meetings.findIndex((item) =>
    item.source === note.source && item.source_id === note.source_id);
  if (index < 0 && meetings.length >= MAX_NOTES) {
    throw new Error("This room has reached its 100 meeting note limit.");
  }
  const existing = index < 0 ? null : meetings[index];
  if (existing && Object.keys(note).every((key) => existing[key] === note[key])) return false;
  const saved = {
    ...note,
    added_by: existing?.added_by || actor,
    added_at: existing?.added_at || now,
    updated_by: actor,
    updated_at: now,
  };
  room.state.meetings = [...meetings];
  if (index < 0) room.state.meetings.push(saved);
  else room.state.meetings[index] = saved;
  return true;
}

// Exact contact matches are candidates. An operator still chooses the room
// because a company can have several rooms or appear in a shared meeting.
export function meetingClientCandidates(attendeeEmails, clients) {
  const emails = new Set(attendeeEmails.map((email) => String(email).trim().toLowerCase()));
  return clients.filter((client) =>
    (client.contacts || []).some((contact) =>
      contact.email && emails.has(String(contact.email).trim().toLowerCase())))
    .map((client) => client.id);
}

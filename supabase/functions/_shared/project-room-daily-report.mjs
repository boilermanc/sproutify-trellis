// Deterministic source summaries. No model calls, inferred commitments, or task execution.
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const short = (value, max) => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return escape(text.length > max ? `${text.slice(0, max)}…` : text); };
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export function buildDailyRoomReport(context, day, { calendarConnected = false, meetingsConnected = false } = {}) {
  if (!dayPattern.test(day)) throw new Error('Provide the report date as YYYY-MM-DD in the reporting timezone.');
  const lines = [`*Trellis daily report — ${day}*`];
  if (!calendarConnected) lines.push('Calendar meeting preparation: not connected to this report.');
  if (!meetingsConnected) lines.push('ChatGPT Meetings: disconnected; manually saved notes are included.');
  if (context.restricted_count) lines.push(`${context.restricted_count} configured room(s) excluded by recipient access.`);
  const priority = room => (room.client?.follow_up_date && room.client.follow_up_date <= day ? 4 : 0) +
    (room.status === 'blocked' ? 2 : 0) + ((room.decisions || []).some(d => d.status === 'proposed') ? 1 : 0);
  const rooms = [...(context.rooms || [])].sort((a, b) => priority(b) - priority(a));
  if (!rooms.length) lines.push('No shared rooms are available in the configured report scope.');
  const included = [];
  for (const room of rooms) {
    const parts = [`\n*${short(room.title, 100)}* (${short(room.status, 40)})`, `Room: ${short(room.id, 36)}`];
    const client = room.client;
    if (client?.follow_up_date && client.follow_up_date <= day) {
      parts.push(`Follow up ${client.follow_up_date < day ? 'overdue' : 'today'}: ${short(client.follow_up_date, 10)}${client.archived_at ? ' — archived prospect' : ''}`);
      if (client.follow_up_note) parts.push(short(client.follow_up_note, 240));
    }
    if (room.summary) parts.push(`Latest summary: ${short(room.summary, 320)}`);
    const meeting = [...(room.meetings || [])].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
    if (meeting) parts.push(`Meeting note: ${short(meeting.title, 100)} (${short(meeting.started_at, 35)}) — ${short(meeting.summary, 220)}`);
    const note = (room.notes || []).at(-1);
    if (note) parts.push(`Team note${note.at ? ` (${short(note.at, 35)})` : ''}: ${short(note.text, 220)}`);
    for (const decision of (room.decisions || []).filter(d => d.status === 'proposed').slice(0, 3)) parts.push(`Decision needed: ${short(decision.text, 200)}`);
    for (const question of (room.questions || []).slice(0, 3)) parts.push(`Open question: ${short(question, 180)}`);
    if (room.status === 'blocked') parts.push('Action needed: open the room and review the blocked step.');
    const part = parts.join('\n');
    if ([...lines, ...included, part].join('\n').length > 3400) break;
    included.push(part);
  }
  lines.push(...included);
  if (included.length < rooms.length) lines.push(`\n${rooms.length - included.length} more room(s) omitted for message length. Open Trellis for the complete list.`);
  lines.push('\nOwners and deadlines are only those recorded in source notes. Review suggestions before acting.');
  return lines.join('\n');
}

// The caller must explicitly confirm the event-to-room mapping and audience access.
export function buildMeetingPreparation(room, meeting) {
  if (meeting.room_id !== room.id) throw new Error('Confirm which room belongs to this calendar meeting.');
  const lines = [
    `*Meeting preparation: ${short(meeting.title, 160)}*`,
    `When: ${short(meeting.starts_at, 100)}`,
    `Client: ${short(room.client?.name || room.title, 160)} — room ${short(room.id, 36)}`,
    `Latest saved context: ${short(room.summary || room.brief || 'No briefing saved.', 1500)}`,
    '\n*Decisions to review*',
    ...(room.decisions?.length ? room.decisions.slice(-8).map(d => `• ${short(d.text, 300)} (${short(d.status || 'status unknown', 40)})`) : ['None recorded.']),
    '\n*Questions to discuss*',
    ...(room.questions?.length ? room.questions.slice(-8).map(q => `• ${short(q, 300)}`) : ['No open questions recorded.']),
    '\n*Previous meeting evidence*',
    ...(room.meetings?.length ? room.meetings.slice(-3).map(m => `• ${short(m.title, 160)} — ${short(m.started_at, 50)}\n${short(m.summary, 900)}${m.source_url ? `\nSource: ${escape(m.source_url)}` : ''}`) : ['No meeting notes saved.']),
    '\n*Suggested agenda*',
    '1. Confirm the objective and changes since the last discussion.',
    '2. Review recorded decisions and resolve open questions.',
    '3. Confirm next steps, owners and dates with the client.',
    'This agenda is a suggestion. Unrecorded owners, deadlines and commitments remain unknown.',
  ];
  const text = lines.join('\n');
  return text.length > 11000 ? `${text.slice(0, 10800)}\n[Report shortened; open the room for full sources.]` : text;
}

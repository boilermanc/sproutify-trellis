import { sanitizePII } from './project-room-sanitize.mjs';
import { proposalTotals, money } from './project-room-proposal.mjs';
export const SLACK_TS = /^\d{10,}\.\d{6}$/;
export const safeSlack = (value, max=300) => sanitizePII(value,max).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function validAudience(result, config) {
  const expected=Object.keys(config.identities);
  const allowed=new Set([...expected,...config.allowed_bots]);
  return result?.ok === true && Array.isArray(result.members) && !result.response_metadata?.next_cursor &&
    expected.length>0 && expected.every(id=>result.members.includes(id)) && result.members.every(id=>allowed.has(id));
}
export function sharedSlackRooms(rooms, members, users, config) {
  const audience=Object.values(config.identities);
  return rooms.filter(room=>room.kind==='client' && room.client && !room.client.archived_at &&
    room.status!=='cancelled' && !/^TEST/i.test(room.title) && audience.length>0 && audience.every(user=>
      users.some(u=>u.auth_user_id===user && u.status==='active' && ['owner','admin','operator'].includes(u.role)) &&
      members.some(m=>m.room_id===room.id && m.user_id===user)));
}
export async function proposalFingerprint(room) {
  const text=JSON.stringify({proposal:room.state?.proposal||null,review:room.state?.proposal_generation?.review||null});
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
}
export function proposalNotification(room, test=false) {
  const proposal=room.state.proposal, review=room.state.proposal_generation?.review;
  const totals=proposalTotals(proposal);
  const status=review?.status==='passed'?'Chief checks passed — ready for your review':review?.status==='needs_review'?'Needs rework — review the chief’s correction notes':'Draft ready — chief review still required';
  const text=[`${test?'*TEST — ': '*'}Trellis proposal: ${safeSlack(room.title,140)}*`,status,
    totals.unpriced?'Pricing has unpriced work; review in Trellis.':`One-time base estimate: ${money(totals.once)}${totals.optional_once?`; optional work: ${money(totals.optional_once)}`:''}`,
    `Outcome: ${safeSlack(proposal.objective,400)}`,
    `<https://trellis.sproutify.app/?view=project-rooms|Open Trellis> → Companies → ${safeSlack(room.client.name,140)} → room “${safeSlack(room.title,140)}” → Proposal & pricing.`,
    `Room: ${room.id}`,
    'Clint and Sheree: reply in this thread to save a room note. Replies do not approve pricing or replace the draft.'];
  return text.join('\n');
}
export function easternDate(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {day:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}
export function latestClientRooms(rooms) {
  const latest=new Map();
  for (const room of [...rooms].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))) if(!latest.has(room.client_id)) latest.set(room.client_id,room);
  return [...latest.values()];
}
export function morningSummary(rooms,day) {
  const lines=[`*Trellis morning summary — ${day}*`,'For Clint and Sheree. Drafts and research suggestions still need your review.'];
  let included=0;
  for(const room of latestClientRooms(rooms)) {
    const proposal=room.state?.proposal, review=room.state?.proposal_generation?.review;
    const status=review?.status==='passed'?'Draft ready to review':review?.status==='needs_review'?'Needs rework':proposal?'Draft needs chief review':room.status.replaceAll('_',' ');
    const parts=[`\n*${safeSlack(room.client.name,100)}* — ${status}`,`Room: ${safeSlack(room.title,140)} (${room.id})`];
    if(proposal) {const total=proposalTotals(proposal);parts.push(total.unpriced?'Pricing: work remains unpriced.':`One-time base estimate: ${money(total.once)}${total.optional_once?`; optional: ${money(total.optional_once)}`:''}`);}
    if(room.client.follow_up_date && room.client.follow_up_date<=day) parts.push(`Follow up: ${room.client.follow_up_date} — ${safeSlack(room.client.follow_up_note,160)}`);
    if(review?.issues?.length) parts.push(`Review needed: ${safeSlack(review.issues[0],200)}`);
    else if(proposal?.next_step) parts.push(`Suggested next step: ${safeSlack(proposal.next_step,200)}`);
    const question=room.state?.questions?.[0];if(question) parts.push(`Question to resolve: ${safeSlack(question,160)}`);
    const note=room.state?.notes?.at(-1);if(note) parts.push(`Latest team note: ${safeSlack(note.text,180)}`);
    const chunk=parts.join('\n'); if([...lines,chunk].join('\n').length>10000) break;
    lines.push(chunk);included++;
  }
  if(!included) lines.push('No shared company rooms available.');
  const count=latestClientRooms(rooms).length;if(included<count) lines.push(`${count-included} more companies available in Trellis.`);
  lines.push('\n<https://trellis.sproutify.app/?view=project-rooms|Open Trellis> to compare drafts. Reply to a client’s proposal notification thread to save a room note; replies to this summary are not assigned to rooms.',
    'Calendar and ChatGPT Meetings are not connected. This summary uses saved room data.');
  return lines.join('\n');
}
export function replyNotes(result, thread, config) {
  if(result?.ok!==true || !Array.isArray(result.messages) || (result.has_more && !result.response_metadata?.next_cursor)) throw new Error('Slack reply fetch failed.');
  return result.messages.filter(m=>m.type==='message' && !m.bot_id && !m.subtype && !m.edited && m.metadata?.event_type!=='trellis_room_notification' &&
    Object.hasOwn(config.identities,m.user) && SLACK_TS.test(m.ts||'') && m.thread_ts===thread && m.ts!==thread &&
    typeof m.text==='string' && m.text.trim()).map(m=>({user:m.user,ts:m.ts,text:sanitizePII(m.text,6000).trim()}));
}

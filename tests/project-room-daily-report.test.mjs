import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyRoomReport, buildMeetingPreparation } from '../supabase/functions/_shared/project-room-daily-report.mjs';
test('daily report includes archived follow-ups, access gaps, and escapes Slack mentions', () => {
  const text = buildDailyRoomReport({ restricted_count: 1, rooms: [{ id: 'one', title: '<!channel>', status: 'blocked', decisions: [{text:'Approve the plan',status:'proposed'}], client: { archived_at: '2026-10-01', follow_up_date: '2026-11-06', follow_up_note: 'Call back' } }] }, '2026-11-07');
  assert.ok(text.includes('overdue') && text.includes('archived prospect'));
  assert.ok(text.includes('excluded by recipient access') && text.includes('disconnected'));
  assert.ok(!text.includes('<!channel>'));
  assert.ok(text.includes('Decision needed: Approve the plan'));
});
test('daily report bounds output and explicitly reports omitted rooms', () => {
  const text = buildDailyRoomReport({ rooms: Array.from({ length: 50 }, (_, id) => ({ id, title: 'Room', summary: 'x'.repeat(2000) })) }, '2026-11-07');
  assert.ok(text.length < 4000);
  assert.ok(text.includes('omitted for message length'));
});
test('meeting prep refuses ambiguous mapping and labels suggested agenda', () => {
  const room = { id: 'one', title: 'Client', questions: ['Confirm launch date?'] };
  assert.throws(() => buildMeetingPreparation(room, { room_id: 'other' }));
  const report = buildMeetingPreparation(room, { room_id: 'one', title: 'Discovery', starts_at: '2026-11-07T09:00:00-05:00' });
  assert.ok(report.includes('Confirm launch date?') && report.includes('This agenda is a suggestion.'));
});
test('attention rooms outrank quiet rooms and include dated meeting and team notes', () => {
  const rooms = Array.from({length:30}, (_,id) => ({id:`quiet-${id}`,title:'Quiet',summary:'x'.repeat(1000)}));
  rooms.push({id:'urgent',title:'Urgent',status:'blocked',client:{follow_up_date:'2026-11-06'},
    meetings:[{title:'Discovery',started_at:'2026-11-06T14:00:00Z',summary:'Client asked for options.'}],
    notes:[{at:'2026-11-07T01:00:00Z',text:'Draft options ready.'}]});
  const text=buildDailyRoomReport({rooms},'2026-11-07');
  assert.ok(text.indexOf('Urgent')<text.indexOf('Quiet'));
  assert.ok(text.includes('Discovery (2026-11-06T14:00:00Z)') && text.includes('Client asked for options.'));
  assert.ok(text.includes('Team note (2026-11-07T01:00:00Z): Draft options ready.'));
});

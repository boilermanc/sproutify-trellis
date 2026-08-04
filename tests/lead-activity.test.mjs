import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let buildActivitySubmission;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ buildActivitySubmission } = await server.ssrLoadModule('/components/leads/LeadActivityModal.tsx'));
});

after(async () => { await server?.close(); });

test('builds call activity with a noon UTC follow-up', () => {
  assert.deepEqual(buildActivitySubmission({ kind: 'call', outcome: 'voicemail', summary: ' Left a message ', meetingDate: '', nextFollowUp: '2026-08-10' }), {
    type: 'lead_call',
    payload: { outcome: 'voicemail', summary: 'Left a message' },
    nextActionAt: '2026-08-10T12:00:00.000Z',
  });
});

test('builds immutable note activity without a follow-up', () => {
  assert.deepEqual(buildActivitySubmission({ kind: 'note', outcome: '', summary: ' Internal context ', meetingDate: '', nextFollowUp: '2026-08-10' }), {
    type: 'lead_note',
    payload: { text: 'Internal context' },
  });
});

test('builds dated meeting activity', () => {
  assert.deepEqual(buildActivitySubmission({ kind: 'meeting', outcome: '', summary: 'Site walk', meetingDate: '2026-08-08', nextFollowUp: '' }), {
    type: 'lead_meeting',
    payload: { meeting_at: '2026-08-08', summary: 'Site walk' },
    nextActionAt: undefined,
  });
});

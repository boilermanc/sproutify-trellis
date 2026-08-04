import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let buildLeadCsv;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ buildLeadCsv } = await server.ssrLoadModule('/components/leads/leadCsv.ts'));
});

after(async () => { await server?.close(); });

test('exports BOM, CRLF, profile phone, and escaped notes', () => {
  const csv = buildLeadCsv([{ profile: { first_name: 'Ana', last_name: 'Moss', email: 'ana@example.com', phone: '555-0100' }, stage: 'new', status: 'open', source: 'manual', estimated_value: 500, next_action_at: null, created_at: '2026-08-04', notes: 'Farm: "A, B"' }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /\r\n/);
  assert.match(csv, /555-0100/);
  assert.match(csv, /"Farm: ""A, B"""/);
});

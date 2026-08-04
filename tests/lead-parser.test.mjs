import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let parseLeadPaste;
let parseLeadRows;

before(async () => {
  server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  ({ parseLeadPaste, parseLeadRows } = await server.ssrLoadModule('/leadService.ts'));
});

after(async () => {
  await server?.close();
});

test('detects an email column labeled contact and maps a named contact', () => {
  const result = parseLeadRows([
    ['Contact Name', 'contact', 'Phone', 'Farm'],
    ['Jane Doe', 'JANE@EXAMPLE.COM', '(555) 010-2000', 'North Farm'],
  ]);

  assert.equal(result.leads.length, 1);
  assert.deepEqual(result.leads[0], {
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '(555) 010-2000',
    source: 'manual',
    notes: 'Farm: North Farm',
    branch_id: '',
    pipeline_id: '',
  });
});

test('maps a grid with no header row by content', () => {
  const result = parseLeadRows([
    ['Alice Smith', 'alice@example.com', '555-010-1234'],
    ['Bob Jones', 'bob@example.com', '555-010-5678'],
  ]);

  assert.deepEqual(result.leads.map(lead => [lead.first_name, lead.last_name, lead.email]), [
    ['Alice', 'Smith', 'alice@example.com'],
    ['Bob', 'Jones', 'bob@example.com'],
  ]);
});

test('drops blank separators in pasted rows', () => {
  const result = parseLeadPaste([
    'Name\tcontact\tPhone',
    'Ana Moss\tana@example.com\t555-111-2222',
    '',
    '\t\t',
    'Lee Pond\tlee@example.com\t555-333-4444',
  ].join('\n'));

  assert.equal(result.leads.length, 2);
  assert.equal(result.skipped.length, 0);
});

test('falls back to the email local-part when the name is empty', () => {
  const result = parseLeadRows([
    ['Name', 'contact', 'Farm'],
    ['', 'tower.person@example.com', 'West Farm'],
  ]);

  assert.equal(result.leads[0].first_name, 'tower.person');
  assert.equal(result.leads[0].last_name, '');
});

test('keeps quoted comma-delimited cells intact in notes', () => {
  const result = parseLeadPaste([
    'contact,name,project status',
    'builder@example.com,Taylor Lake,"50, under const."',
  ].join('\n'));

  assert.equal(result.leads[0].notes, 'project status: 50, under const.');
});

test('keeps the first email occurrence and skips later in-file duplicates', () => {
  const result = parseLeadRows([
    ['Name', 'contact', 'Farm'],
    ['First Person', 'same@example.com', 'Farm One'],
    ['Second Person', 'SAME@example.com', 'Farm Two'],
  ]);

  assert.equal(result.leads.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, 'duplicate in file');
});

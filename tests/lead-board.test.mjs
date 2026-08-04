import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let daysSince;
let parseFarmOrOrg;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ daysSince, parseFarmOrOrg } = await server.ssrLoadModule('/components/leads/LeadBoard.tsx'));
});

after(async () => { await server?.close(); });

test('extracts common farm and organization note labels', () => {
  assert.equal(parseFarmOrOrg('country: USA | farm name: Porterville College CA | tower qty: 10'), 'Porterville College CA');
  assert.equal(parseFarmOrOrg('Company: Green School | status: ready'), 'Green School');
});

test('calculates whole days in stage', () => {
  assert.equal(daysSince('2026-08-01T12:00:00Z', Date.parse('2026-08-04T13:00:00Z')), 3);
});

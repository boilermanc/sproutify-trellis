import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let buildQuotePayload;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ buildQuotePayload } = await server.ssrLoadModule('/components/leads/LeadQuoteModal.tsx'));
});

after(async () => { await server?.close(); });

test('normalizes a quote amount and description', () => {
  assert.deepEqual(buildQuotePayload({ amount: '12500.50', description: ' Ten-tower setup ', status: 'accepted' }), {
    amount: 12500.5,
    description: 'Ten-tower setup',
    status: 'accepted',
  });
});

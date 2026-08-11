import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all send_resend_email call sites use named parameter objects', async () => {
  const files = ['leadService.ts', 'src/services/resendService.ts'];
  const sources = await Promise.all(files.map(read));
  const callSites = sources.flatMap(source => [...source.matchAll(/\.rpc\(['"]send_resend_email['"],\s*([^\n]+)/g)]);

  assert.equal(callSites.length, 2);
  for (const callSite of callSites) assert.match(callSite[1], /^\{/);
});

test('campaign CC reaches both test RPC and durable batch sends', async () => {
  const [builder, resend, worker] = await Promise.all([
    read('pages/CampaignBuilder.tsx'),
    read('src/services/resendService.ts'),
    read('supabase/functions/campaign-sender/index.ts'),
  ]);

  assert.match(builder, /cc:\s*emailCc\.trim\(\) \|\| undefined/);
  assert.match(builder, /useState\('team@sproutify\.app'\)/);
  assert.match(resend, /p_from:[\s\S]*p_cc:/);
  assert.match(worker, /\.\.\.\(cc \? \{ cc: \[cc\] \} : \{\}\)/);
});

test('lead email keeps its Resend id and exposes delivery activity in lead details', async () => {
  const leads = await read('pages/Leads.tsx');

  assert.match(leads, /const sendResult = await sendLeadEmail/);
  assert.match(leads, /resend_email_id:\s*sendResult\.id/);
  assert.match(leads, /<EmailActivitySection email=\{lead\.profile\.email\}/);
});

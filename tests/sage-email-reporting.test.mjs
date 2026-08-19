import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Sage routes recent email-open questions to live campaign reporting', () => {
  const chat = read('components/SageChat.tsx');
  assert.match(chat, /isRecentEmailOpenQuestion/);
  assert.match(chat, /fetchRecentCampaignPerformance\(branch\.query, 2\)/);
  assert.match(chat, /fetchSharedCampaignOpeners/);
  assert.match(chat, /exact email-address intersection/);
  assert.match(chat, /unique opens/);
  assert.match(chat, /I won’t invent open counts/);
  assert.match(chat, /tickets: \[\]/);
  assert.match(chat, /filter\(m => m\.role === 'user'\)/);
});

test('recent campaign reporting is branch-aware and keyed by campaign id', () => {
  const reporting = read('services/emailReportingService.ts');
  assert.match(reporting, /from\('campaigns'\)/);
  assert.match(reporting, /matchesBranch\(row\.branches\)/);
  assert.match(reporting, /from\('campaign_stats_by_id'\)/);
  assert.match(reporting, /\.in\('campaign_id'/);
  assert.match(reporting, /event_type', 'opened'/);
  assert.match(reporting, /rest\.every\(\(set\) => set\.has\(email\)\)/);
});

test('Sage prompt forbids invented data and theatrical gardening language', () => {
  const ai = read('services/aiService.ts');
  assert.match(ai, /Never invent subjects, counts, rates/);
  assert.match(ai, /Do not use gardening metaphors/);
  assert.match(ai, /Do not mention tickets unless the user asks/);
});

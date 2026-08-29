import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('Sweetwater Substack is a registered public channel', () => {
  const service = read('services/substackChannelService.ts');
  assert.match(service, /sweetwatertechnology\.substack\.com/);
  assert.match(service, /Sweetwater Technology/);
  assert.match(service, /Rekkrd/);
  assert.match(service, /Rejoice/);
  assert.match(service, /publish\/stats/);
  assert.match(service, /subscriber\/profile data remains in Substack/i);
});

test('Substack feed reader is allowlisted and public-metadata only', () => {
  const worker = read('supabase/functions/substack-feed/index.ts');
  assert.match(worker, /ALLOWED_PUBLICATIONS/);
  assert.match(worker, /publicationUrl.*\/feed/);
  assert.match(worker, /<item/);
  assert.match(worker, /article\.url\.startsWith/);
  assert.doesNotMatch(worker, /cookie|password|subscriber_email/i);
});

test('Content Intelligence exposes the Substack channel and safe handoff links', () => {
  const page = read('pages/ContentIntelligence.tsx');
  const panel = read('components/SubstackChannelPanel.tsx');
  assert.match(page, /Channels/);
  assert.match(page, /<SubstackChannelPanel/);
  assert.match(panel, /Publisher dashboard/);
  assert.match(panel, /View stats/);
  assert.match(panel, /Recent Substack articles/);
  assert.match(panel, /Writing, publishing, subscribers, and private analytics remain in Substack/);
});

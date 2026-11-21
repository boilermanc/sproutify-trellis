import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProject } from '../scripts/content-intelligence.mjs';

const root = process.cwd();
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260911195839_configure_spectiq_branch.sql'), 'utf8');
const constants = readFileSync(join(root, 'constants.ts'), 'utf8');
const utils = readFileSync(join(root, 'utils.ts'), 'utf8');
const aiService = readFileSync(join(root, 'services', 'aiService.ts'), 'utf8');
const sageChat = readFileSync(join(root, 'components', 'SageChat.tsx'), 'utf8');
const mark = readFileSync(join(root, 'public', 'brands', 'spectiq-logo-mark.svg'), 'utf8');
const lockup = readFileSync(join(root, 'public', 'brands', 'spectiq-logo-lockup.svg'), 'utf8');

test('SpectIQ branch seed is complete and intentionally Trellis-native', () => {
  assert.match(migration, /'SpectIQ'[\s\S]*'spectiq'[\s\S]*'internal'/);
  assert.match(migration, /'#E56A2C'[\s\S]*'#1B1F27'[\s\S]*'#FAF8F5'[\s\S]*'Public Sans'/);
  assert.match(migration, /'SpectIQ <clint@spectiq\.app>'/);
  assert.match(migration, /'clint@spectiq\.app'/);
  assert.match(migration, /spoke_connection_id = null/);
  assert.match(migration, /clint@sproutify\.app/);
  assert.match(migration, /branch_role\)\s*values \(clint_user_id, spectiq_branch_id, 'lead'\)/);
  assert.doesNotMatch(migration, /insert into public\.(spoke_connections|lead_pipelines|leads|lead_email_sequences)/i);
});

test('SpectIQ operational brand services and neutral email template are seeded', () => {
  assert.match(migration, /insert into public\.brand_identities/);
  assert.match(migration, /insert into public\.marketing_brands/);
  assert.match(migration, /insert into public\.brand_profiles/);
  assert.match(migration, /'Home Inspection Business Software'/);
  assert.match(migration, /'Sweetwater Technology LLC'/);
  assert.match(migration, /'1295 Smithdale Heights Drive'/);
  assert.match(migration, /SpectIQ General Update/);
  assert.match(migration, /spectiq-general-update-v1/);
  assert.match(migration, /production_prospect_outreach_enabled[^\n]*false/);
  assert.match(migration, /https:\/\/spectiq\.app\/privacy/);
  assert.match(migration, /\{\{unsubscribe_url\}\}/);
  assert.doesNotMatch(migration, /Sheree|sproutify-farm-new-tower|Farm CC/i);
});

test('SpectIQ creative rules and fallbacks use the approved identity', () => {
  assert.match(constants, /spectiq:\s*\{/);
  assert.match(constants, /skeptical home inspection company owners/);
  assert.match(constants, /bannedWords:[\s\S]*'game-changer'[\s\S]*'seamless'/);
  assert.match(utils, /'spectiq': 'SpectIQ'/);
  assert.match(utils, /'spectiq\.app': 'SpectIQ'/);
  assert.match(aiService, /SpectIQ \(spectiq\.app\)/);
  assert.match(sageChat, /normalized\.includes\('spectiq'\)/);
});

test('official SpectIQ assets preserve the floor plan and one signal-orange room', () => {
  for (const asset of [mark, lockup]) {
    assert.match(asset, /#1B1F27/);
    assert.equal((asset.match(/<rect[^>]+fill="#E56A2C"/g) || []).length, 1);
    assert.doesNotMatch(asset, /gradient|magnif|lens/i);
  }
  assert.match(lockup, /font-family="Public Sans/);
  assert.match(lockup, />Spect<tspan fill="#E56A2C">IQ<\/tspan>/);
});

test('SpectIQ content intelligence partition is valid and populated', () => {
  const result = validateProject(root, 'spectiq');
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.topics, 6);
  const strategy = readFileSync(join(root, '.trellis', 'spec', 'projects', 'spectiq', 'content-strategy.md'), 'utf8');
  assert.match(strategy, /one auditable path from inquiry through estimate, agreement, payment, and booking/i);
  assert.match(strategy, /not an inspection-report writer/i);
  assert.match(strategy, /No gradients/i);
});

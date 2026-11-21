import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../services/prospectingService.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../types.ts', import.meta.url), 'utf8');

function loadCsvNeutralizer() {
  const source = service.match(/export function neutralizeCsvFormula\(value: unknown\): string \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'neutralizeCsvFormula implementation exists');
  const executable = source
    .replace('export function', 'function')
    .replace('(value: unknown): string', '(value)');
  return Function(`${executable}; return neutralizeCsvFormula;`)();
}

test('CSV formula injection prefixes every spreadsheet trigger character', () => {
  const neutralize = loadCsvNeutralizer();
  for (const dangerous of ['=2+2', '+cmd', '-10+20', '@SUM(A1:A2)']) {
    assert.equal(neutralize(dangerous), `'${dangerous}`);
  }
  assert.equal(neutralize('SpectIQ'), 'SpectIQ');
  assert.equal(neutralize(null), '');
});

test('CSV construction quotes cells and always passes values through the neutralizer', () => {
  assert.match(service, /neutralizeCsvFormula\(value\)\.replace\(\/"\/g, '\"\"'\)/);
  assert.match(service, /EXPORT_COLUMNS\.map\(\(\[key\]\) => quoteCsvCell\(row\[key\]\)\)/);
  assert.match(service, /\\uFEFF/);
});

test('prospecting service uses only isolated SpectIQ tables', () => {
  for (const table of [
    'spectiq_prospecting_territories',
    'spectiq_prospects',
    'spectiq_prospect_contacts',
    'spectiq_prospect_claims',
    'spectiq_prospect_notes',
    'spectiq_prospect_tasks',
    'spectiq_prospect_activity',
  ]) assert.match(service, new RegExp(`from\\('${table}'\\)`));

  assert.doesNotMatch(service, /service_role|lead_pipelines|lead_email_|from\('leads'\)|Manus|Resend|send_resend_email/i);
});

test('founder export and access checks remain server-authorized and scoped', () => {
  assert.match(service, /rpc\('spectiq_prospecting_access_status'\)/);
  assert.match(service, /rpc\('approve_spectiq_prospect_pitch_ready'/);
  assert.match(service, /rpc\('export_spectiq_prospects', \{/);
  assert.match(service, /p_prospect_ids: prospectIds/);
  assert.match(service, /p_territory_id: territoryId/);
  assert.match(service, /p_redacted: options\.redacted !== false/);
  assert.doesNotMatch(service, /auth\.mfa|AuthenticatorAssuranceLevel|challengeAndVerify/);
});

test('sales, website, and verification states are independent complete unions', () => {
  for (const state of ['new', 'audited', 'review_pending', 'pitch_ready', 'contacted', 'engaged', 'demo_booked', 'won', 'nurture', 'not_a_fit']) {
    assert.match(types, new RegExp(`\\| '${state}'`));
  }
  for (const state of ['unreviewed', 'evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved']) {
    assert.match(types, new RegExp(`\\| '${state}'`));
  }
  for (const state of ['official_website_confirmed', 'official_website_not_identified', 'website_unreachable_at_scan_time', 'social_or_directory_only_observed', 'needs_human_verification']) {
    assert.match(types, new RegExp(`\\| '${state}'`));
  }
});

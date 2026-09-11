import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [service, sql, constants] = await Promise.all([
  readFile(new URL('../services/prospectingService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260911222525_complete_spectiq_prospecting_crud.sql', import.meta.url), 'utf8'),
  readFile(new URL('../constants.ts', import.meta.url), 'utf8'),
]);

test('exposes the complete manual Phase 1 mutation contract', () => {
  for (const name of [
    'createTerritory', 'updateTerritory', 'archiveTerritory',
    'createProspect', 'updateProspect', 'archiveProspect',
    'createProspectContact', 'updateProspectContact',
    'createProspectClaim', 'updateProspectClaim', 'reviewProspectClaim',
    'updateProspectVerification', 'updateProspectTaskStatus',
    'completeProspectTask', 'cancelProspectTask',
  ]) assert.match(service, new RegExp(`export async function ${name}\\b`));
});

test('uses server-authorized commands for security-sensitive transitions', () => {
  for (const rpc of [
    'archive_spectiq_prospect', 'archive_spectiq_territory',
    'review_spectiq_prospect_claim', 'update_spectiq_prospect_verification',
    'update_spectiq_prospect_task_status',
  ]) {
    assert.match(service, new RegExp(`rpc\\('${rpc}'`));
    assert.match(sql, new RegExp(`FUNCTION public\\.${rpc}`, 'i'));
  }
  assert.match(sql, /SECURITY INVOKER/gi);
  assert.match(sql, /private\.is_spectiq_prospecting_founder\(\)/i);
  assert.doesNotMatch(sql, /auth\.jwt\(\)->>'aal'|aal2|mfa/i);
});

test('server classifies archive, review, and task audit events', () => {
  for (const event of ['territory_archived', 'prospect_archived', 'claim_updated', 'claim_reviewed', 'task_completed', 'task_cancelled']) {
    assert.match(sql, new RegExp(`'${event}'`));
  }
  assert.match(sql, /NEW\.email_verified_at := now\(\)/i);
  assert.match(sql, /SET archived_at = COALESCE\(archived_at, now\(\)\)/i);
  assert.match(sql, /SET verification_decision = p_decision/i);
  assert.match(sql, /SET status = p_status/i);
});

test('keeps table and function permissions narrow', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION %s TO authenticated/i);
  assert.match(sql, /REVOKE DELETE ON TABLE[\s\S]+FROM authenticated/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.spectiq_prospect_activity FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(sql, /GRANT[\s\S]{0,120}DELETE[\s\S]{0,120}TO authenticated/i);
});

test('includes the follow-up migration in the Schema Engine stamp', () => {
  assert.match(constants, /import SPECTIQ_PROSPECTING_CRUD_SQL_SCHEMA from '.+20260911222525_complete_spectiq_prospecting_crud\.sql\?raw';/);
  assert.match(constants, /\$\{SPECTIQ_PROSPECTING_CRUD_SQL_SCHEMA\}/);
});

test('does not expose deferred research, email, or conversion actions', () => {
  for (const source of [service, sql]) {
    assert.doesNotMatch(source, /Manus|Resend|send_spectiq|convert_spectiq|organization_created/i);
  }
});

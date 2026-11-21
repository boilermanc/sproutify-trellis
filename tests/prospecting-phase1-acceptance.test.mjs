import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, layout, page, service, migration] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/Layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../pages/Prospecting.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../services/prospectingService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260911202452_add_spectiq_prospecting_foundation.sql', import.meta.url), 'utf8'),
]);

const expectPageText = (...labels) => {
  for (const label of labels) assert.match(page, new RegExp(label, 'i'), `Prospecting UI exposes “${label}”`);
};

const expectServiceExport = (...names) => {
  for (const name of names) {
    assert.match(service, new RegExp(`export async function ${name}\\b`), `service exports ${name}`);
    assert.match(page, new RegExp(`\\b${name}\\b`), `Prospecting UI uses ${name}`);
  }
};

test('founder can navigate to the isolated SpectIQ pipeline', () => {
  assert.match(layout, /id: 'prospecting', label: 'SpectIQ Prospecting'/);
  assert.match(app, /case 'prospecting': return <Prospecting addToast=\{addToast\}/);
  expectPageText('Pipeline', 'Review Queue', 'Playbook', 'Territories');
  assert.doesNotMatch(page, /from ['"][^'"]*(?:Leads|manusService)|lead_pipelines|lead_email_sequences/i);
});

test('normal Trellis login is the only interactive access step', () => {
  assert.match(page, /getProspectingAccessStatus/);
  assert.match(page, /Founder (?:workspace|control plane)/i);
  assert.match(page, /Prospecting unavailable/i);
  assert.match(migration, /u\.status = 'active'/i);
  assert.match(migration, /u\.platform_role = 'platform_super_admin'/i);

  for (const source of [page, service, migration]) {
    assert.doesNotMatch(source, /\bMFA\b|authenticator|six-digit|auth\.mfa|aal2|AuthenticatorAssuranceLevel|challengeAndVerify/i);
  }
});

test('prospect and territory records can be created, edited, and archived', () => {
  expectServiceExport(
    'createOrUpdateProspect',
    'archiveProspect',
    'createTerritory',
    'updateTerritory',
    'archiveTerritory',
  );
  assert.match(page, /(?:New|Create|Add) prospect/i);
  expectPageText('Edit prospect', 'Archive prospect');
  assert.match(page, /(?:New|Create|Add) territory/i);
  expectPageText('Edit territory', 'Archive territory');
  assert.match(service, /\.from\('spectiq_prospects'\)/);
  assert.match(service, /\.from\('spectiq_prospecting_territories'\)/);
  assert.match(service, /archived_at/);
});

test('contacts have founder-controlled create and edit surfaces', () => {
  expectServiceExport('createProspectContact', 'updateProspectContact');
  expectPageText('Add contact', 'Edit contact', 'Primary contact', 'Email verification');
  assert.match(service, /\.from\('spectiq_prospect_contacts'\)/);
  assert.match(page, /verified/i);
});

test('evidence can be recorded, corrected, and given an explicit review decision', () => {
  expectServiceExport('createProspectClaim', 'updateProspectClaim', 'reviewProspectClaim');
  expectPageText('Add evidence', 'Edit evidence', 'Approve', 'Correct', 'Reject', 'Founder correction');
  assert.match(service, /\.from\('spectiq_prospect_claims'\)/);
  for (const decision of ['approved', 'corrected', 'rejected']) assert.match(page, new RegExp(decision, 'i'));
  for (const sourceField of ['source_url', 'source_type', 'source_excerpt', 'confidence']) {
    assert.match(service, new RegExp(`\\b${sourceField}\\b`), `evidence retains ${sourceField}`);
  }
});

test('verification is separate from sales stage and pitch-ready stays server guarded', () => {
  expectServiceExport('updateProspectVerification');
  assert.match(service, /export async function approveProspectPitchReady\b/);
  assert.match(service, /salesState === 'pitch_ready'\) return approveProspectPitchReady\(id\)/);
  expectPageText('Verification', 'Pitch ready');
  for (const state of ['evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved']) {
    assert.match(page, new RegExp(state));
  }
  assert.match(service, /rpc\('approve_spectiq_prospect_pitch_ready'/);
  assert.match(migration, /CREATE TRIGGER spectiq_pitch_ready_guard/i);
  assert.match(migration, /NEW\.verification_state <> 'outreach_approved'/i);
  assert.match(page, /Stage changes never grant outreach approval/i);
});

test('founder can complete or cancel follow-up tasks', () => {
  expectServiceExport('createProspectTask', 'completeProspectTask', 'cancelProspectTask');
  assert.match(service, /export async function updateProspectTaskStatus\b/);
  expectPageText('Follow-up task', 'Complete', 'Cancel');
  assert.match(service, /'completed'/);
  assert.match(service, /'cancelled'/);
});

test('archive, audit, RLS, and least-grant boundaries remain enforced by the database', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.audit_spectiq_record_change/i);
  assert.match(migration, /CREATE TRIGGER spectiq_activity_immutable/i);
  assert.match(migration, /SpectIQ prospect activity is immutable/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.spectiq_prospect_activity TO authenticated/i);
  assert.doesNotMatch(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[^;]+TO authenticated/i);
  assert.match(migration, /archived_at TIMESTAMPTZ/i);
});

test('Phase 2 research does not expose outbound-send or conversion actions', () => {
  assert.match(page, /Research candidates enter this pipeline only after explicit founder review and import/i);
  assert.match(page, /Outbound email remains disabled/i);
  assert.doesNotMatch(page, />\s*(?:Send email|Contact prospect|Convert prospect|Create organization)\s*</i);
  assert.doesNotMatch(page, /send(?:Prospect|Resend|Email)|convertProspect|retryOnboarding/i);
  assert.doesNotMatch(service, /Resend|send_resend_email|email_drafts|convertProspect|organization_created/i);
});

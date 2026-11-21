import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = {
  foundation: '../supabase/migrations/20260911202452_add_spectiq_prospecting_foundation.sql',
  migration: '../supabase/migrations/20260911233823_add_spectiq_prospect_research.sql',
  research: '../supabase/functions/spectiq-prospect-research/index.ts',
  shared: '../supabase/functions/_shared/spectiq-prospect-research.ts',
  webhook: '../supabase/functions/spectiq-manus-webhook/index.ts',
  service: '../services/prospectingResearchService.ts',
  page: '../pages/Prospecting.tsx',
};

const [foundation, migration, research, shared, webhook, service, page] = await Promise.all(
  Object.values(paths).map(path => readFile(new URL(path, import.meta.url), 'utf8')),
);

const researchServer = `${research}\n${shared}`;
const combinedServer = `${foundation}\n${migration}\n${researchServer}\n${webhook}`;

test('research schema is founder-closed, auditable, and isolated from tenant/Farm data', () => {
  for (const table of [
    'spectiq_prospect_research_runs',
    'spectiq_prospect_research_candidates',
    'spectiq_manus_webhook_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i'));
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /private\.is_spectiq_prospecting_founder/i);
  assert.match(migration, /REVOKE ALL[\s\S]*PUBLIC[\s\S]*anon/i);
  assert.match(migration, /platform_super_admin/i);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.(?:leads|profiles|lead_pipelines|lead_email_sequences)\b/i);
});

test('research accepts city, county, state, and ZIP scopes with bounded targets', () => {
  for (const kind of ['city', 'county', 'state', 'zip']) {
    assert.match(combinedServer, new RegExp(`['"]${kind}['"]`), `${kind} is an accepted scope`);
  }
  assert.match(researchServer, /zip(?:_code)?[\s\S]{0,500}\^?\\d\{5\}/i);
  assert.match(researchServer, /state(?:_code)?[\s\S]{0,500}\[A-Z\]\{2\}/i);
  assert.match(researchServer, /target(?:_count)?[\s\S]{0,800}(?:MIN|MAX|>=|<=|Math\.min|Math\.max)/i);
  assert.match(researchServer, /target(?:_count)?[\s\S]{0,800}(?:throw|error|invalid|between|range)/i);
});

test('all research mutations are server-side and re-check active founder authorization', () => {
  assert.match(research, /Authorization/i);
  assert.match(research, /auth\.getUser|supabase\.auth\.getUser/i);
  assert.match(research, /spectiq_prospecting_access_status|trellis_users/i);
  assert.match(combinedServer, /platform_super_admin/i);
  assert.match(combinedServer, /status[\s\S]{0,80}active/i);
  assert.match(service, /functions\.invoke\(['"]spectiq-prospect-research['"]/i);
  assert.doesNotMatch(service, /\.from\(['"]spectiq_prospect_research_(?:runs|candidates)['"]\)\.(?:insert|update|delete)/i);
});

test('MANUS_API_KEY is read only inside the server research adapter', () => {
  assert.match(research, /Deno\.env\.get\(['"]MANUS_API_KEY['"]\)/);
  assert.doesNotMatch(service, /MANUS_API_KEY|Deno\.env|VITE_.*MANUS|manus.*api.*key/i);
  assert.doesNotMatch(page, /MANUS_API_KEY|VITE_.*MANUS|manus.*api.*key/i);
});

test('Manus is constrained to strict structured output and public-business evidence', () => {
  assert.match(researchServer, /structured[_ -]?output|json[_ -]?schema|response[_ -]?format/i);
  for (const boundary of [
    /public business information/i,
    /untrusted(?: JSON)? (?:data|content)/i,
    /(?:ignore|do not follow)[^\n]{0,100}instructions/i,
    /not[_ ]identified|did not identify/i,
    /does not exist/i,
    /evidence[^\n]{0,120}(?:claim|material)/i,
    /unsupported[^\n]{0,120}(?:performance|conversion|business.loss)/i,
  ]) assert.match(researchServer, boundary);
  for (const field of ['company_name', 'website_state', 'claims', 'source_url', 'source_type', 'source_excerpt', 'confidence']) {
    assert.match(researchServer, new RegExp(`\\b${field}\\b`), `structured candidate includes ${field}`);
  }
});

test('untrusted Manus output is validated before normalized records are stored', () => {
  assert.match(researchServer, /(?:validate|persist)[A-Za-z]*(?:Candidate|Result|Output)|safeParse|\.parse\(/);
  assert.match(researchServer, /Array\.isArray|typeof [^\n]+===? ['"](?:string|object|number)['"]/);
  assert.match(researchServer, /raw_(?:result|response|payload)|raw_output/i);
  assert.match(researchServer, /validation_error|invalid structured|schema validation|malformed|valid structured candidates/i);
  assert.match(researchServer, /partial/i);
});

test('every fetched or returned URL is protected against SSRF and redirect rebinding', () => {
  assert.match(researchServer, /new URL\(/);
  assert.match(researchServer, /https?:/i);
  assert.match(researchServer, /username|password|credentials/i);
  for (const blocked of [
    /127\.|a === 127/, /10\.|a === 10/, /172\.(?:1[6-9]|2\d|3[01])\.|a === 172[^\n]+b >= 16[^\n]+b <= 31/, /192\.168\.|a === 192[^\n]+b === 168/,
    /169\.254\./, /0\.0\.0\.0/, /::1/, /fc00|fd00|fe80/i,
    /169\.254\.169\.254/, /metadata\.google\.internal/i,
  ]) assert.match(researchServer, blocked);
  assert.match(researchServer, /Deno\.resolveDns|resolveDns|dns/i);
  assert.match(researchServer, /redirect[\s\S]{0,600}(?:manual|location)/i);
  assert.match(researchServer, /(?:validate|assert|guard)[A-Za-z]*(?:Url|Host)[\s\S]{0,500}(?:redirect|location)/i);
});

test('Manus webhooks require RSA-SHA256, freshness, and event replay protection', () => {
  assert.match(webhook, /RSASSA-PKCS1-v1_5/i);
  assert.match(webhook, /SHA-256/i);
  assert.match(webhook, /crypto\.subtle\.(?:importKey|verify)/i);
  assert.match(webhook, /timestamp/i);
  assert.match(webhook, /(?:300|5\s*\*\s*60|five.minute)/i);
  assert.match(webhook, /spectiq_manus_webhook_events/i);
  assert.match(migration, /event_id[^\n]*(?:UNIQUE|PRIMARY KEY)|UNIQUE[^\n]*event_id/i);
  assert.match(webhook, /duplicate|idempot|23505|already processed/i);
  assert.doesNotMatch(webhook, /return new Response\([^)]*(?:stack|error\.message)/i);
});

test('polling, retry, missed-callback recovery, and partial results are explicit', () => {
  for (const action of ['start', 'list', 'get', 'poll', 'retry']) {
    assert.match(service, new RegExp(`\\b${action}[A-Z][A-Za-z]*Research|\\b${action}Research`, 'i'), `${action} client action exists`);
  }
  assert.match(researchServer, /poll/i);
  assert.match(researchServer, /retry/i);
  assert.match(combinedServer, /partial/i);
  assert.match(combinedServer, /attempt|retry_count|retry_of/i);
  assert.match(page, /Poll|Refresh research|Check status/i);
  assert.match(page, /Retry/i);
});

test('candidate review supports correction, rejection, create-import, and merge-import', () => {
  for (const decision of ['approved', 'corrected', 'rejected']) {
    assert.match(combinedServer, new RegExp(`['"]${decision}['"]`));
  }
  assert.match(service, /review[A-Za-z]*Candidate/i);
  assert.match(service, /import[A-Za-z]*Candidate/i);
  assert.match(combinedServer, /founder_correction/i);
  assert.match(combinedServer, /(?:import_mode|mode)[\s\S]{0,200}['"]create['"][\s\S]{0,200}['"]merge['"]/i);
  assert.match(page, /Correct/i);
  assert.match(page, /Reject/i);
  assert.match(page, /Import as new|Create prospect/i);
  assert.match(page, /Merge/i);
});

test('candidate import deduplicates by domain and normalized name/geography', () => {
  assert.match(combinedServer, /official_domain/i);
  assert.match(combinedServer, /normalized_company_name/i);
  assert.match(combinedServer, /city|county|state_code|postal_code/i);
  assert.match(combinedServer, /duplicate|dedup|conflict|merge/i);
  assert.match(combinedServer, /idx_spectiq_prospects_official_domain|ON CONFLICT|maybeSingle|\.or\(/i);
});

test('candidate import preserves claim-level evidence without promoting its review state', () => {
  const importFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.import_spectiq_research_candidate[\s\S]*?GRANT EXECUTE ON FUNCTION public\.import_spectiq_research_candidate/i)?.[0] || '';
  assert.match(importFunction, /raw_candidate[\s\S]{0,200}(?:->|#>)[\s\S]{0,80}claims|jsonb_(?:array_elements|to_recordset)[^\n]*claims/i);
  for (const field of [
    'claim_type', 'display_value', 'normalized_value', 'source_url',
    'source_type', 'source_excerpt', 'confidence',
  ]) assert.match(importFunction, new RegExp(`(?:item|claim)[^\\n]{0,120}${field}|${field}[^\\n]{0,120}(?:item|claim)`, 'i'));
  assert.match(importFunction, /verification_decision[\s\S]{0,1000}['"]pending['"]/i);
  assert.doesNotMatch(importFunction, /verification_decision[\s\S]{0,1000}['"](?:approved|corrected)['"]/i);
});

test('research remains advisory and cannot auto-approve, contact, email, or convert', () => {
  assert.match(researchServer, /(?:cannot|must not|never|do not)[^\n]{0,160}(?:approve|contact|outreach|convert)/i);
  assert.doesNotMatch(service, /send(?:Email|Resend)|convertProspect|approveProspectPitchReady/);
  assert.doesNotMatch(researchServer, /functions\.invoke\(['"](?:lead-email-send|campaign-sender|invite-user)['"]|resend\.emails\.send|send_resend_email/i);
  assert.doesNotMatch(researchServer, /verification_state\s*:\s*['"]outreach_approved['"]|sales_state\s*:\s*['"]pitch_ready['"]/i);
  assert.doesNotMatch(researchServer, /spectiq_prospect_conversion_milestones|organization_created|owner_invited/i);
  assert.doesNotMatch(page, />\s*(?:Send email|Contact prospect|Convert prospect|Create organization)\s*</i);
});

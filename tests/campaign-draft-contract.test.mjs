import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('draft persistence cannot enqueue or dispatch mail', () => {
  const service = read('supabaseService.ts');
  assert.match(service, /status:\s*'draft'/);
  assert.match(service, /dispatch:\s*null/);
  assert.match(service, /send_status:\s*null/);
  assert.match(service, /\.eq\('status',\s*'draft'\)/);
});

test('builder saves, restores, and launches the same draft row', () => {
  const builder = read('pages/CampaignBuilder.tsx');
  assert.match(builder, /builder_state:\s*draftSnapshot/);
  assert.match(builder, /emailCc:\s*string/);
  assert.match(builder, /fetchCampaignById\(draftCampaignId\)/);
  assert.match(builder, /setConsentConfirmed\(false\)/);
  assert.match(builder, /draftId\s*\?\s*await launchCampaignDraft\(draftId, campaignPayload\)/);
  assert.match(builder, /setTimeout\(\(\) => handleSaveDraft\(\{ silent: true \}\), 1500\)/);
});

test('campaign image choices persist and render through the shared brand asset library', () => {
  const builder = read('pages/CampaignBuilder.tsx');
  const library = read('services/brandAssetLibraryService.ts');
  const picker = read('components/CampaignBrandAssetLibrary.tsx');

  assert.match(builder, /templateImageOverrides:\s*Record<string, string>/);
  assert.match(builder, /setTemplateImageOverrides\(saved\.templateImageOverrides \|\| \{\}\)/);
  assert.match(builder, /applyTemplateImageOverrides\(html, templateImageOverrides\)/);
  assert.match(builder, /<CampaignBrandAssetLibrary/);
  assert.match(library, /const BRAND_ASSET_BUCKET = 'email-assets'/);
  assert.match(library, /`\$\{branchSlug\}\/gallery`/);
  assert.match(library, /extractTemplateImageSlots/);
  assert.match(library, /uploadBrandGalleryAsset/);
  assert.match(picker, /Choose an email image/);
  assert.match(picker, /Pick a library image/);
});

test('campaign list exposes the resume handoff', () => {
  const campaigns = read('pages/Campaigns.tsx');
  const app = read('App.tsx');
  assert.match(campaigns, /Continue Editing/);
  assert.match(campaigns, /onEditDraft\(c\.id\)/);
  assert.match(app, /setCampaignDraftId\(id\); setActiveView\('campaign-builder'\)/);
});

test('migration removes anonymous campaign access and scopes writes', () => {
  const migration = read('supabase/migrations/20260804114818_campaign_draft_ownership.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth\.users/);
  assert.match(migration, /REVOKE ALL ON public\.campaigns FROM anon/);
  assert.match(migration, /owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /Campaign owners delete drafts/);
});

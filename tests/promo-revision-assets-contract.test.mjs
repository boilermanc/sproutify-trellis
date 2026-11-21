import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('revision asset bindings preserve immutable origin and enforce project-scoped access', async () => {
  const [migration, constants] = await Promise.all([
    read('../supabase/migrations/20260826183711_add_promo_revision_asset_bindings.sql'), read('../constants.ts'),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promo_revision_assets/);
  assert.match(migration, /UNIQUE \(revision_id, asset_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.promo_revision_assets FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration,
    /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|(?:SELECT|INSERT|UPDATE|DELETE)(?:\s*,\s*(?:SELECT|INSERT|UPDATE|DELETE))*)\s+ON\s+(?:TABLE\s+)?public\.promo_revision_assets\s+TO\s+(?:PUBLIC|anon|authenticated)\b/i);
  assert.doesNotMatch(migration, /CREATE\s+POLICY[\s\S]*?ON\s+public\.promo_revision_assets\b/i);
  assert.match(migration, /idx_promo_revision_assets_project/);
  assert.match(migration, /idx_promo_revision_assets_asset/);
  assert.match(migration, /AFTER INSERT ON public\.promo_assets/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.promo_revision_assets/);
  assert.match(migration, /NEW\.project_id IS DISTINCT FROM revision_project_id/);
  assert.match(migration, /NEW\.project_id IS DISTINCT FROM asset_project_id/);
  assert.match(migration, /'origin'/);
  assert.match(migration, /'revision_carry_forward'[\s\S]*jsonb_array_elements/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE)[^;]*authenticated/i);
  assert.match(constants, /PROMO_REVISION_ASSET_BINDINGS_SQL_SCHEMA/);
  assert.match(constants, /\$\{PROMO_REVISION_ASSET_BINDINGS_SQL_SCHEMA\}/);
});

test('child revisions bind only server-verified parent assets before activation', async () => {
  const edge = await read('../supabase/functions/promo-studio/index.ts');
  assert.match(edge, /function persistPromoRevisionAssetBindings/);
  assert.match(edge, /\.from\("promo_revision_assets"\)[\s\S]*\.eq\("revision_id", input\.sourceRevisionId\)/);
  assert.match(edge, /Every manifest asset must already be bound to the active parent revision/);
  const bindingInsert = edge.indexOf('.from("promo_revision_assets").insert');
  const activation = edge.indexOf('.from("promo_projects").update', bindingInsert);
  assert.ok(bindingInsert > -1 && activation > bindingInsert);
  assert.match(edge, /binding_reason: adopted\.has\(assetId\) \? \(input\.adoptedBindingReason \|\| "manual_adoption"\) : "revision_carry_forward"/);
  assert.match(edge, /adoptedAssetIds: artifactIds, adoptedBindingReason: "capture_adoption"/);
  assert.match(edge, /adoptedBindingReason: gate === "voice" \? "voice_adoption" : "music_adoption"/);
});

test('capture adoption reloads identity, evidence, artifacts, and audit lineage server-side', async () => {
  const edge = await read('../supabase/functions/promo-studio/index.ts');
  assert.match(edge, /action === "adopt_capture"/);
  assert.match(edge, /body\.capture_run_id/);
  assert.doesNotMatch(edge, /body\.(?:video_asset_id|still_asset_ids|trace_asset_id)/);
  assert.match(edge, /promo_capture_runs[\s\S]*\.eq\("status", "succeeded"\)/);
  assert.match(edge, /promo_capture_scenarios[\s\S]*\.eq\("status", "verified"\)/);
  assert.match(edge, /promo_assets[\s\S]*\.in\("id", artifactIds\)\.eq\("status", "ready"\)/);
  assert.match(edge, /promo_events[\s\S]*\.eq\("event_type", "job\.succeeded"\)[\s\S]*\.contains\("details", \{ capture_run_id: run\.id \}\)/);
});

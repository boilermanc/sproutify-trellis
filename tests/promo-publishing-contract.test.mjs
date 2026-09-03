import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('final Promo render approval and scheduling are one service-role-only transaction', async () => {
  const [migration, constants, edge, service] = await Promise.all([
    read('../supabase/migrations/20260903161325_link_promo_to_scheduled_publishing.sql'), read('../constants.ts'),
    read('../supabase/functions/promo-studio/index.ts'), read('../services/promoStudioService.ts'),
  ]);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.approve_and_schedule_promo_post/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /kind = 'render_master'/);
  assert.match(migration, /job_type = 'final_render'/);
  assert.match(migration, /INSERT INTO public\.promo_approvals/);
  assert.match(migration, /INSERT INTO public\.scheduled_social_posts/);
  assert.match(migration, /source_promo_project_id, source_promo_job_id, source_promo_asset_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.approve_and_schedule_promo_post[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.approve_and_schedule_promo_post[\s\S]*TO service_role/);
  assert.match(constants, /PROMO_SCHEDULED_PUBLISHING_SQL_SCHEMA/);
  assert.match(edge, /schedule_final_publish/);
  assert.match(service, /schedulePromoFinalPublish/);
});

test('scheduled worker resolves approved private Promo assets only after claim', async () => {
  const [migration, blueprintText] = await Promise.all([
    read('../supabase/migrations/20260903161325_link_promo_to_scheduled_publishing.sql'),
    read('../n8n-blueprints/S1-scheduled-post-publisher.json'),
  ]);
  const blueprint = JSON.parse(blueprintText);
  const privateCheck = blueprint.nodes.find(node => node.name === 'Has Private Generated Media?');
  const resolver = blueprint.nodes.find(node => node.name === 'Fetch Generated Asset');
  assert.match(JSON.stringify(privateCheck), /source_promo_asset_id/);
  assert.match(JSON.stringify(resolver), /resolve_scheduled_generated_media/);
  assert.match(migration, /scheduled\.status = 'publishing'/);
  assert.match(migration, /scheduled\.source = 'promo_studio'/);
  assert.match(migration, /asset\.approved = true/);
  assert.match(migration, /approval\.gate = 'final'/);
  assert.match(migration, /NOT EXISTS \([\s\S]*public\.promo_approvals later/);
});

test('Promo Studio v1 schedules Instagram video without persisting a signed URL', async () => {
  const migration = await read('../supabase/migrations/20260903161325_link_promo_to_scheduled_publishing.sql');
  assert.match(migration, /'instagram', trim\(p_caption\), 'video', '\[\]'::jsonb/);
  assert.doesNotMatch(migration, /createSignedUrl|signed_url|signedURL/);
});

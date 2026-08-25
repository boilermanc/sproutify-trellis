import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Motion Posts schema is owner-scoped and stores no xAI key in job rows', () => {
  const sql = read('supabase/migrations/20260819195905_add_motion_posts.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.motion_post_jobs/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /auth\.uid\(\).*created_by/s);
  assert.match(sql, /REVOKE ALL ON public\.motion_post_jobs FROM anon, authenticated/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS xai_api_key TEXT/);
  assert.doesNotMatch(sql, /motion_post_jobs[\s\S]*api_key\s+TEXT/i);
});

test('Edge Function uses the official xAI image-to-video contract server-side', () => {
  const edge = read('supabase/functions/motion-posts/index.ts');
  assert.match(edge, /grok-imagine-video-1\.5/);
  assert.match(edge, /\/videos\/generations/);
  assert.match(edge, /image:\s*\{\s*url:/);
  assert.match(edge, /aspect_ratio:\s*"9:16"/);
  assert.match(edge, /\/videos\/\$\{job\.provider_request_id\}/);
  assert.match(edge, /tenant_secrets.*select\("xai_api_key"\)/s);
  assert.match(edge, /sanitizeMotionPrompt/);
  assert.match(edge, /Marketing operator access required/);
});

test('organization secrets remain restricted to active owners and admins', () => {
  const secrets = read('supabase/functions/tenant-secrets/index.ts');
  assert.match(secrets, /\.eq\("auth_user_id", userData\.user\.id\)/);
  assert.match(secrets, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(secrets, /Owner or admin access required/);
});

test('selected Rekkrd music is ownership checked and finished by the existing worker', () => {
  const edge = read('supabase/functions/motion-posts/index.ts');
  const worker = read('workers/video_worker.py');
  assert.match(edge, /eq\("created_by", userId\)/);
  assert.match(edge, /pipeline:\s*"motion_post"/);
  assert.match(worker, /pipeline not in \("episode", "studio", "motion_post"\)/);
  assert.match(worker, /job\.get\("created_by"\) == b\["user_id"\]/);
  assert.match(worker, /scale=1080:1920/);
  assert.match(worker, /-movflags", "\+faststart"/);
});

test('UI routes ready video through the durable scheduled Reel publisher', () => {
  const app = read('App.tsx');
  const layout = read('components/Layout.tsx');
  const service = read('services/motionPostService.ts');
  const edge = read('supabase/functions/motion-posts/index.ts');
  const scheduled = read('n8n-blueprints/S1-scheduled-post-publisher.json');
  const publisher = read('n8n-blueprints/B3-social-publisher-v2.json');
  assert.match(app, /case 'motion-posts'/);
  assert.match(layout, /id: 'motion-posts'/);
  assert.match(service, /queueMotionPostPublication/);
  assert.match(edge, /op === "queue_publish"/);
  assert.match(edge, /media_type:\s*"video"/);
  assert.match(edge, /source_motion_post_id/);
  assert.match(scheduled, /media_type/);
  assert.match(publisher, /media_type.*REELS/s);
  assert.match(service, /jfif/);
});

test('timed text creates an immutable Motion Post derivative rendered by the existing worker', () => {
  const sql = read('supabase/migrations/20260825153000_add_motion_post_finishing_and_publishing.sql');
  const edge = read('supabase/functions/motion-posts/index.ts');
  const worker = read('workers/clip-render-worker/worker.mjs');
  const editor = read('components/motion-posts/MotionPostFinishingEditor.tsx');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.motion_post_finishing_jobs/);
  assert.match(sql, /UNIQUE \(created_by, idempotency_key\)/);
  assert.match(sql, /REVOKE ALL ON public\.motion_post_finishing_jobs FROM anon, authenticated/);
  assert.match(edge, /op === "queue_finish"/);
  assert.match(edge, /finishingInput/);
  assert.match(worker, /renderMotionPostFinish/);
  assert.match(worker, /MediaFinishing/);
  assert.match(editor, /mediaFontIdForFamily\(branch\?\.font_family\)/);
  assert.match(editor, /The original Motion Post is unchanged/);
});

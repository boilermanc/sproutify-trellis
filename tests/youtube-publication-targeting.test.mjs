import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260812180913_add_youtube_account_to_publications.sql', import.meta.url);
const episodeUrl = new URL('../services/episodeService.ts', import.meta.url);
const clipUrl = new URL('../services/clipService.ts', import.meta.url);
const studioUrl = new URL('../supabase/functions/studio-albums/index.ts', import.meta.url);
const tokenBrokerUrl = new URL('../supabase/functions/youtube-publish-token/index.ts', import.meta.url);
const uploaderUrl = new URL('../n8n-blueprints/E11-youtube-account-upload.json', import.meta.url);

test('publication tables retain and validate the immutable YouTube account id', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.equal((sql.match(/ADD COLUMN IF NOT EXISTS youtube_account_id/g) || []).length, 3);
  assert.match(sql, /REFERENCES public\.branch_social_accounts\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /account\.status = 'active'/);
  assert.match(sql, /branch\.slug = v_branch_slug/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF youtube_account_id, platform/);
});

test('all three publishing handoffs include youtube_account_id', async () => {
  const sources = await Promise.all([episodeUrl, clipUrl, studioUrl].map(url => readFile(url, 'utf8')));
  for (const source of sources) assert.match(source, /youtube_account_id/);
});

test('token broker is service-role-only and verifies refreshed tokens against the channel id', async () => {
  const source = await readFile(tokenBrokerUrl, 'utf8');
  assert.match(source, /authorization === `Bearer \$\{SERVICE_KEY\}`/);
  assert.match(source, /get_social_account_credential/);
  assert.match(source, /grant_type: "refresh_token"/);
  assert.match(source, /channelId !== expectedChannelId/);
  assert.doesNotMatch(source, /app_secret[^\n]*return json/);
});

test('publishing workflows delegate to the account-aware resumable uploader', async () => {
  const [uploaderSource, ...parentSources] = await Promise.all([
    readFile(uploaderUrl, 'utf8'),
    ...['E4-episode-publish.json', 'E8-clip-publish.json', 'E10-studio-album-publish.json']
      .map(name => readFile(new URL(`../n8n-blueprints/${name}`, import.meta.url), 'utf8')),
  ]);
  const uploader = JSON.parse(uploaderSource);
  assert.ok(uploader.nodes.some(node => node.name === 'Resolve YouTube Token'));
  assert.ok(uploader.nodes.some(node => node.name === 'Start Resumable Upload'));
  assert.ok(uploader.nodes.some(node => node.name === 'Upload Video Bytes'));
  assert.doesNotMatch(uploaderSource, /REPLACE_WITH_YOUR_YOUTUBE_CREDENTIAL|youTubeOAuth2Api/);
  for (const source of parentSources) {
    assert.match(source, /REPLACE_WITH_E11_WORKFLOW_ID/);
    assert.match(source, /youtube_account_id/);
    assert.doesNotMatch(source, /REPLACE_WITH_YOUR_YOUTUBE_CREDENTIAL|youTubeOAuth2Api/);
  }
});

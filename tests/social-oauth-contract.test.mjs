import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const oauth = await readFile(new URL('../supabase/functions/social-oauth/index.ts', import.meta.url), 'utf8');
const wizard = await readFile(new URL('../pages/PlatformSetupWizard.tsx', import.meta.url), 'utf8');

test('Facebook OAuth rejects Graph errors and an empty Page grant before storing an active credential', () => {
  assert.match(oauth, /if \(!pagesRes\.ok \|\| pagesData\.error\)/);
  assert.match(oauth, /Facebook returned no Pages/);
  assert.match(oauth, /platform === "facebook" && !platformMetadata\.page_id/);

  const validation = oauth.indexOf('platform === "facebook" && !platformMetadata.page_id');
  const upsert = oauth.indexOf('"upsert_social_credential"', validation);
  assert.ok(validation >= 0 && upsert > validation, 'Facebook Page validation must happen before the credential upsert');
});

test('the setup wizard live-tests an active credential before reporting success', () => {
  assert.match(wizard, /const live = await testConnection\(/);
  assert.match(wizard, /if \(live\.ok\) \{\s*setIsConnected\(true\)/);
  assert.match(wizard, /setConnectError\(live\.error/);
});

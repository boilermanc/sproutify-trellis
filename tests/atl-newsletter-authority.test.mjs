import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Profiles excludes ATL customer sources while campaigns keep the live newsletter path', async () => {
  const [profiles, builder, worker] = await Promise.all([
    read('pages/Profiles.tsx'),
    read('pages/CampaignBuilder.tsx'),
    read('supabase/functions/campaign-sender/index.ts'),
  ]);

  assert.match(profiles, /ATL_SPOKE_PROJECT_REF = 'povudgtvzggnxwgtjexa'/);
  assert.match(profiles, /c\.status === 'active' && !isAtlProfileSource\(c\)/);
  assert.match(profiles, /hubSources[\s\S]*\.filter\(s => !isAtlProfileSource\(s\)\)/);
  assert.match(builder, /ATL email campaigns must target ATL only/);
  assert.match(worker, /readBranchConsent\([\s\S]*ATL_BRANCH[\s\S]*ATL_SPOKE_SERVICE_KEY/);
  assert.match(worker, /not in live ATL newsletter audience at dispatch/);
});

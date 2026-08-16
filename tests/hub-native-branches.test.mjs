import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Branches with no spoke database (still-janes-daughter, sproutify-home,
// sweetwater-urban-farms) used to be invisible in Campaign Builder: they had no
// spoke connection to enter the picker through, and no loader ever read their
// Hub-side subscribers. These tests pin both halves of that fix.

test('Campaign Builder sources targetable branches from the branches table', async () => {
  const builder = await read('pages/CampaignBuilder.tsx');

  const memo = builder.match(/const availableBranches = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
  assert.ok(memo, 'availableBranches useMemo not found');
  const body = memo[0];

  // Every active branch record is targetable, whether or not it has a spoke.
  assert.match(body, /branches\s*\n?\s*\.filter\(b => b\.is_active !== false && b\.slug\)/);
  assert.match(body, /\.\.\.fromBranchRecords/);

  // The branch-record list is gated on is_active/slug ONLY — never on having a
  // spoke connection, which is what excluded still-janes-daughter before.
  const recordList = body.match(/const fromBranchRecords = [\s\S]*?;/)[0];
  assert.doesNotMatch(recordList, /spoke|connection/i);

  // The memo has to react to branches loading in, or the picker renders stale.
  assert.match(body, /\}, \[branches, profiles, spokeConnections, slugByConnectionId\]\);$/);
});

test('Hub-native subscribers are loaded and exclude non-audience rows', async () => {
  const service = await read('lib/supabaseService.ts');

  assert.match(service, /export async function fetchHubBranchProfiles\(\): Promise<Profile\[\]>/);

  const fn = service.match(/export async function fetchHubBranchProfiles[\s\S]*?\n\}/)[0];

  // Operator accounts and the Leads CRM live in the same table with branches:[].
  // Pulling them in would dump leads into campaign audiences.
  assert.match(fn, /Array\.isArray\(row\.branches\) && row\.branches\.length > 0/);
  assert.match(fn, /\.neq\('status', 'deleted'\)/);

  // Consent defaults must stay conservative: an explicit false wins.
  assert.match(fn, /is_subscribed: row\.is_subscribed !== false/);
  assert.match(fn, /marketing_pause: row\.marketing_pause === true/);
});

test('App merges Hub-native profiles on email without dropping branch tags', async () => {
  const app = await read('App.tsx');

  assert.match(app, /import \{[^}]*fetchHubBranchProfiles[^}]*\} from '\.\/lib\/supabaseService'/);
  assert.match(app, /fetchHubBranchProfiles\(\)\.then\(setHubProfiles\)/);

  const memo = app.match(/const profiles: Profile\[\] = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
  assert.ok(memo, 'profiles useMemo not found');
  const body = memo[0];

  // Someone can be both an ATL customer and an SJD subscriber — the union keeps
  // them targetable from both branches instead of one side silently winning.
  assert.match(body, /branches: Array\.from\(new Set\(\[\.\.\.existing\.branches, \.\.\.hub\.branches\]\)\)/);
  assert.match(body, /hubProfiles\]\);$/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Branches with no spoke database (still-janes-daughter, sproutify-home,
// sweetwater-urban-farms) keep their subscribers Hub-side in profiles.branches.
// They were invisible in Campaign Builder (no spoke connection to enter the
// picker through) and in Profiles (every row is keyed on _spoke_id). These
// tests pin the pseudo-spoke wiring that makes them a first-class data source.

test('Campaign Builder sources targetable branches from the branches table', async () => {
  const builder = await read('pages/CampaignBuilder.tsx');

  const memo = builder.match(/const availableBranches = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
  assert.ok(memo, 'availableBranches useMemo not found');
  const body = memo[0];

  assert.match(body, /branches\s*\n?\s*\.filter\(b => b\.is_active !== false && b\.slug\)/);
  assert.match(body, /\.\.\.fromBranchRecords/);

  // The branch-record list is gated on is_active/slug ONLY — never on having a
  // spoke connection, which is what excluded still-janes-daughter before.
  const recordList = body.match(/const fromBranchRecords = [\s\S]*?;/)[0];
  assert.doesNotMatch(recordList, /spoke|connection/i);

  assert.match(body, /\}, \[branches, profiles, spokeConnections, slugByConnectionId\]\);$/);
});

test('Hub-native rows load as one pseudo-spoke per branch tag', async () => {
  const service = await read('lib/supabaseService.ts');

  assert.match(service, /export const HUB_SPOKE_PREFIX = 'hub:'/);
  assert.match(service, /export async function fetchHubNativeProfiles\(\): Promise<HubNativeResult>/);

  const fn = service.match(/export async function fetchHubNativeProfiles[\s\S]*?\n\}/)[0];

  // Operator accounts and the Leads CRM share this table with branches:[].
  // Pulling them in would dump leads into campaign audiences.
  assert.match(fn, /if \(!Array\.isArray\(row\.branches\) \|\| row\.branches\.length === 0\) continue;/);
  assert.match(fn, /\.neq\('status', 'deleted'\)/);

  // A tag pointing at a deleted/deactivated branch is stale data, not audience.
  assert.match(fn, /if \(!name\) continue;/);

  // Consent stays conservative: an explicit false is respected, nothing invented.
  assert.match(fn, /subscribed: row\.is_subscribed !== false/);

  // One emitted row per branch tag, keyed hub:<slug>.
  assert.match(fn, /for \(const slug of row\.branches\)/);
  assert.match(fn, /_spoke_id: spokeId/);
});

test('App resolves hub pseudo-spokes to slugs and collapses on email', async () => {
  const app = await read('App.tsx');

  assert.match(app, /import \{[^}]*hubSlugFromSpokeId[^}]*\} from '\.\/lib\/supabaseService'/);

  const memo = app.match(/const profiles: Profile\[\] = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
  assert.ok(memo, 'profiles useMemo not found');
  const body = memo[0];

  // hub:<slug> must resolve to the slug BEFORE falling back to the display
  // name, or Hub profiles get tagged "Still Jane's Daughter" instead of the slug.
  assert.match(body, /hubSlugFromSpokeId\(p\._spoke_id\)\s*\n?\s*\|\| slugByConnectionId\.get\(p\._spoke_id\)/);

  // One person can appear once per spoke AND once per Hub branch tag — the
  // union keeps them targetable from every branch instead of one source winning.
  assert.match(body, /branches: Array\.from\(new Set\(\[\.\.\.existing\.branches, \.\.\.p\.branches\]\)\)/);

  // The parallel Hub loader is gone; everything comes through useBranchStats.
  assert.doesNotMatch(app, /fetchHubBranchProfiles/);
});

test('useBranchStats treats Hub-native branches as stat sources', async () => {
  const hook = await read('hooks/useBranchStats.ts');

  assert.match(hook, /fetchHubNativeProfiles/);
  assert.match(hook, /hubSources,/);

  // Without seeding statsMap from hubSources, the profile loop's
  // `if (!statsMap[sid]) continue` silently drops every Hub-native row.
  assert.match(hook, /const sourceMeta[\s\S]*?\.\.\.hubSources\.map/);

  // Hub-native branches must still load when no spoke connection is active,
  // otherwise a Hub-only ecosystem shows an empty Profiles page.
  assert.match(hook, /if \(active\.length === 0\) \{\s*\n\s*setEnrichedProfiles\(hub\.profiles\);/);
});

test('Profiles offers Hub-native branches as selectable data sources', async () => {
  const page = await read('pages/Profiles.tsx');

  const sources = page.match(/const dataSources = useMemo\(\(\) => \(\[[\s\S]*?\]\), \[[^\]]*\]\);/);
  assert.ok(sources, 'dataSources useMemo not found');
  assert.match(sources[0], /branchStats\.hubSources/);
  assert.match(sources[0], /isHub: true/);

  // The picker, select-all, scope sync and the pick-a-branch gate must all run
  // off the combined list — any one of them left on spokeConnections re-hides
  // the Hub branches.
  assert.match(page, /\{dataSources\.map\(\(connection\) => \{/);
  assert.match(page, /setSelectedSpokeIds\(new Set\(dataSources\.map\(s => s\.id\)\)\)/);
  assert.match(page, /const activeConnectionCount = dataSources\.length;/);
  assert.doesNotMatch(page, /spokeConnections\.filter\(c => c\.status === 'active'\)\.map\(c => c\.id\)/);
});

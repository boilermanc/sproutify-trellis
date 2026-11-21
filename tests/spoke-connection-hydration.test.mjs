import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('federated reads wait for authenticated Hub connection hydration', () => {
  assert.match(app, /const \[spokeConnectionsReady, setSpokeConnectionsReady\] = useState\(false\)/);
  assert.match(app, /useBranchStats\(spokeConnectionsReady \? spokeConnections : \[\]\)/);
  assert.match(app, /if \(!user\?\.id\) \{[\s\S]*?setSpokeConnectionsReady\(false\);[\s\S]*?return;/);
});

test('the authenticated Hub result always replaces the local cache', () => {
  assert.match(app, /const connections = await fetchSpokeConnections\(SPROUTIFY_ORG_ID\);[\s\S]*?setSpokeConnections\(connections\);[\s\S]*?setSpokeConnectionsReady\(true\);/);
  assert.doesNotMatch(app, /connections\.length > 0 \|\| spokeConnections\.length === 0/);
  assert.match(app, /\}, \[user\?\.id\]\);/);
});

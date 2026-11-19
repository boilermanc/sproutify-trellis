import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('App exposes one refresh path for the registry and global branch context', async () => {
  const app = await read('App.tsx');

  assert.match(app, /const refreshBranches = useCallback\(async \(\) => \{/);
  assert.match(app, /const branchData = await fetchAllBranches\(\)/);
  assert.match(app, /const activeBranches = branchData\.filter\(branch => branch\.is_active\)/);
  assert.match(app, /setBranches\(branchData\)/);
  assert.match(app, /setAllBranches\(previousBranches => \{/);
  assert.match(app, /onBranchesChange=\{refreshBranches\}/);
});

test('fresh localhost sessions recover safe spoke ids from the branch registry', async () => {
  const app = await read('App.tsx');

  assert.match(app, /function connectionsFromBranchRegistry\(branches: Branch\[\]\)/);
  assert.match(app, /const connectionId = branch\.spoke_connection_id/);
  assert.match(app, /tables: RUNTIME_TABLE_GATES/);
  assert.match(app, /status: 'active'/);
  assert.match(app, /setSpokeConnections\(currentConnections =>\s*\n\s*currentConnections\.length > 0\s*\n\s*\? currentConnections\s*\n\s*: connectionsFromBranchRegistry\(activeBranches\)/);
  assert.match(app, /connections\.length > 0 \? connections : currentConnections/);
});

test('Branch Command Center refreshes shared consumers after branch mutations', async () => {
  const commandCenter = await read('pages/BranchCommandCenter.tsx');

  assert.match(commandCenter, /onBranchesChange\?: \(\) => Promise<void>/);
  assert.match(commandCenter, /async function refreshBranchConsumers\(\)/);
  assert.match(commandCenter, /await onBranchesChange\?\.\(\)/);

  const createHandler = commandCenter.match(/const handleCreateBranch =[\s\S]*?\n  \};/);
  assert.ok(createHandler, 'handleCreateBranch not found');
  assert.match(createHandler[0], /await createBranch\(/);
  assert.match(createHandler[0], /await refreshBranchConsumers\(\)/);
});

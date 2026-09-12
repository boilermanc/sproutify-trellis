import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the shared shell protects the phone viewport from desktop overflow', () => {
  const layout = read('components/Layout.tsx');
  assert.match(layout, /min-w-0 flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(layout, /hidden min-h-11 min-w-11 border transition-colors sm:block/);
  assert.match(layout, /p-3 sm:p-4 lg:p-8/);
  assert.match(layout, /z-\[60\] bg-slate-950\/60 lg:hidden/);
  assert.match(layout, /z-\[70\].*lg:z-40/);
});

test('the dashboard has a dedicated compact phone navigation', () => {
  const dashboard = read('pages/Dashboard.tsx');
  assert.match(dashboard, /grid w-full grid-cols-3 gap-1 sm:flex/);
  assert.match(dashboard, /t\.id === 'control' \? 'Overview' : t\.id === 'standup' \? 'Actions' : 'Branches'/);
  assert.match(dashboard, /degradedCount \? `\$\{degradedCount\} issues` : 'Healthy'/);
  assert.doesNotMatch(dashboard, /justify-between gap-4 overflow-x-auto/);
});

test('control room cards and activity rows reflow for phones', () => {
  const controlRoom = read('components/dashboard/ControlRoom.tsx');
  assert.match(controlRoom, /grid grid-cols-2 gap-2\.5 sm:grid-cols-3/);
  assert.match(controlRoom, /grid-cols-\[42px_12px_minmax\(0,1fr\)\]/);
  assert.match(controlRoom, /line-clamp-2 min-w-0 text-\[12px\]/);
  assert.match(controlRoom, /order-1 flex flex-col gap-3/);
  assert.match(controlRoom, /hidden sm:block/);
});

test('secondary dashboard panels stop using dense phone grids', () => {
  const standup = read('components/dashboard/MorningStandup.tsx');
  const emailPulse = read('components/dashboard/EmailPulse.tsx');
  const help = read('components/ContextAwareHelp.tsx');
  const sage = read('components/SageChat.tsx');

  assert.match(standup, /grid grid-cols-1 gap-\[14px\] sm:grid-cols-2/);
  assert.match(standup, /grid w-auto flex-shrink-0 grid-cols-2 gap-2.*sm:flex/);
  assert.match(emailPulse, /grid grid-cols-2 gap-3 sm:grid-cols-4/);
  assert.match(help, /hidden flex-col items-end pointer-events-none sm:flex/);
  assert.match(sage, /hidden h-16 w-16 items-center.*sm:flex/);
});

test('team members has a phone-specific, null-safe roster', () => {
  const team = read('pages/TeamMembers.tsx');
  assert.match(team, /space-y-3 md:hidden/);
  assert.match(team, /hidden overflow-x-auto.*md:block/);
  assert.match(team, /member\.first_name\?\.charAt\(0\) \|\| member\.email\?\.charAt\(0\)\.toUpperCase\(\) \|\| '\?'/);
  assert.doesNotMatch(team, /member\.first_name\.charAt\(0\)/);
});

test('the primary Team route uses the authenticated operator roster', () => {
  const app = read('App.tsx');
  const teamPanel = read('pages/TeamPanel.tsx');
  assert.match(app, /import TeamPanel from '\.\/pages\/TeamPanel';/);
  assert.match(app, /case 'team': return <TeamPanel \/>;/);
  assert.doesNotMatch(app, /case 'team': return <TeamMembers/);
  assert.match(teamPanel, /space-y-3 md:hidden/);
  assert.match(teamPanel, /hidden overflow-x-auto.*md:block/);
});

test('the mobile social connection header keeps its status badge in view', () => {
  const settings = read('pages/Settings.tsx');
  assert.match(settings, /flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between/);
  assert.match(settings, /flex min-w-0 items-center space-x-3 sm:space-x-4/);
  assert.match(settings, /flex shrink-0 items-center space-x-2 bg-emerald-100/);
  assert.match(settings, /p-4 sm:p-8 space-y-8/);
});

test('federated connection cards wrap long endpoints on phones', () => {
  const connections = read('ConnectionsManager.tsx');
  assert.match(connections, /flex min-w-0 flex-1 items-start space-x-3 sm:space-x-4/);
  assert.match(connections, /mt-1 break-all font-mono text-\[11px\] text-slate-500 sm:text-xs/);
  assert.match(connections, /mt-1\.5 flex flex-wrap items-center gap-1\.5/);
  assert.match(connections, /flex shrink-0 items-center space-x-2/);
});

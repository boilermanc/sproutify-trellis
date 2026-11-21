import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/dashboard/ControlRoom.tsx', import.meta.url), 'utf8');

test('a failed check cannot turn the entire health panel red', () => {
  assert.match(source, /id="system-health" className="bg-white border border-slate-200/);
  assert.match(source, /SYSTEM_STYLE\[s.status\].className/);
  assert.match(source, /ok: \{ label: 'Check passed', className: 'bg-emerald-50 border-emerald-200/);
  assert.match(source, /down: \{ label: 'Needs repair', className: 'bg-red-50 border-red-200/);
  assert.match(source, /warning: \{ label: 'Needs review', className: 'bg-amber-50 border-amber-200/);
});

test('passing and optional checks are separated from actionable findings', () => {
  assert.match(source, /const attention = systems.filter\(\(s\) => s.status !== 'ok' && s.status !== 'optional'\)/);
  assert.match(source, /attention.map\(renderRow\)/);
  assert.match(source, /passed.map\(renderRow\)/);
  assert.match(source, /optional.map\(renderRow\)/);
  assert.match(source, /No checks available yet/);
  assert.match(source, /Connection checks do not prove data is current or complete/);
});

test('repair queue explains the human handoff and verified closure', () => {
  assert.match(source, /github.com\/boilermanc\/sproutify-trellis\/issues\?q=is%3Aissue\+is%3Aopen\+label%3Atrellis-health/);
  assert.match(source, /It does not fix code automatically/);
  assert.match(source, /Ask Codex to fix an issue, review and deploy the fix/);
  assert.match(source, /complete recheck confirms recovery/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, layout, page] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/Layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../pages/Prospecting.tsx', import.meta.url), 'utf8'),
]);

test('wires SpectIQ Prospecting into Trellis without reusing Farm Leads', () => {
  assert.match(app, /case 'prospecting': return <Prospecting addToast=\{addToast\}/);
  assert.match(layout, /id: 'prospecting', label: 'SpectIQ Prospecting'/);
  assert.doesNotMatch(page, /from ['"]\.\/Leads|lead_pipelines|lead_email_sequences/);
});

test('fails closed behind the trusted founder role and keeps outbound actions unavailable', () => {
  assert.match(page, /getProspectingAccessStatus/);
  assert.match(page, /Prospecting unavailable/i);
  assert.doesNotMatch(page, /MFA|authenticator|six-digit/i);
  assert.match(page, /Outbound email remains disabled/i);
  assert.match(page, /explicit founder review and import/i);
  assert.doesNotMatch(page, /sendResend|sendProspectEmail|convertProspect|retryOnboarding/);
});

test('exposes the Phase 1 founder workflow surfaces', () => {
  for (const label of ['Pipeline', 'Review Queue', 'Playbook', 'Territories']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /exportProspectsCsv/);
  assert.match(page, /addProspectNote/);
  assert.match(page, /createProspectTask/);
  assert.match(page, /getProspectDetail/);
});

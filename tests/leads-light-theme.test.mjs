import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Leads opts into the scoped light theme', async () => {
  const [leads, css] = await Promise.all([read('pages/Leads.tsx'), read('index.css')]);
  assert.match(leads, /className="leads-light/);
  assert.match(css, /\.leads-light \[class\*="bg-\[\#0A0E27\]"\]/);
});

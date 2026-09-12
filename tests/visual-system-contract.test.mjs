import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../components/ui/TrellisUI.tsx', import.meta.url), 'utf8');

test('defines the restrained Trellis visual-system foundation', () => {
  for (const token of [
    '--trellis-brand: #0b4a6b',
    '--trellis-accent: #059669',
    '--trellis-ink: #0f172a',
    '--trellis-muted: #475569',
    '--trellis-canvas: #f8fafc',
    '--trellis-subtle: #f1f5f9',
    '--trellis-surface: #ffffff',
    '--trellis-line: #e2e8f0',
  ]) assert.match(indexCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

  assert.match(indexHtml, /family=Public\+Sans/);
  assert.match(indexHtml, /family=Roboto\+Mono/);
  assert.doesNotMatch(indexHtml, /family=Inter/);
  assert.doesNotMatch(indexHtml, /family=JetBrains\+Mono/);
  assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(indexCss, /:focus-visible/);
});

test('provides reusable UI primitives for page and interaction chrome', () => {
  for (const component of [
    'Page', 'PageHeader', 'PageTitle', 'SectionHeader', 'SectionTitle',
    'Card', 'CardBody', 'Button', 'FieldLabel', 'Input', 'Select', 'Textarea',
    'StatusLabel', 'EmptyState', 'DataRow', 'Tabs', 'Tab', 'ModalShell', 'Drawer',
  ]) assert.match(ui, new RegExp(`export (?:const|interface) ${component}\\b`));
});

test('uses a flat, compact application shell', () => {
  assert.match(layout, /w-\[232px\]/);
  assert.match(layout, /h-16/);
  assert.match(layout, /trellis-app/);
  assert.match(layout, /bg-trellis-canvas/);
  assert.doesNotMatch(layout, /bg-gradient/);
  assert.doesNotMatch(layout, /rounded-(?:2xl|3xl)/);
  assert.doesNotMatch(layout, /shadow-(?:lg|xl|2xl)/);
});


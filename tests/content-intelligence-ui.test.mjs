import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('Content Intelligence is a first-class routed navigation destination', () => {
  assert.match(read('types.ts'), /'content-intelligence'/);
  assert.match(read('components/Layout.tsx'), /Content Intelligence/);
  assert.match(read('App.tsx'), /case 'content-intelligence'.*<ContentIntelligence/s);
  assert.match(read('src/data/pageInfo.ts'), /'content-intelligence'/);
});

test('the registry discovers project partitions instead of hardcoding supported branches', () => {
  const registry = read('services/contentIntelligenceRegistry.ts');
  assert.match(registry, /import\.meta\.glob\('\.\.\/\.trellis\/knowledge\/projects\/\*\/\*\.jsonl'/);
  assert.match(registry, /import\.meta\.glob\('\.\.\/\.trellis\/spec\/projects\/\*\/\*\.md'/);
  assert.doesNotMatch(registry, /\['rejoice',\s*'rekkrd'\]/);
});

test('the page exposes the complete closed-loop content record set', () => {
  const page = read('pages/ContentIntelligence.tsx');
  for (const label of ['How It Works', 'Topics', 'Assets', 'Experiments', 'Performance', 'Learnings', 'New Task']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /navigator\.clipboard\.writeText\(command\)/);
  assert.match(page, /create-project --project/);
  assert.match(page, /npm run content -- validate/);
});

test('the Help Center and contextual flyout document the operating workflow', () => {
  const helpContent = read('src/data/helpContent.ts');
  const contextualHelp = read('components/ContextAwareHelp.tsx');
  assert.match(helpContent, /art_content_intelligence_guide/);
  assert.match(helpContent, /The Seven-Step Workflow/);
  assert.match(contextualHelp, /'content-intelligence'/);
  assert.match(contextualHelp, /art_content_intelligence_guide/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const constants = readFileSync(new URL('../constants.ts', import.meta.url), 'utf8');
const aiService = readFileSync(new URL('../services/aiService.ts', import.meta.url), 'utf8');
const cardStudio = readFileSync(new URL('../pages/CardStudio.tsx', import.meta.url), 'utf8');

test('Card Studio brief recipes cover every requested live brand slug and a default', () => {
  for (const key of ['rejoice', 'rekkrd', 'atlurbanfarms', 'still-janes-daughter', 'sproutify-farm', 'default']) {
    assert.match(constants, new RegExp(`(?:^|\\n)  ['"]?${key.replaceAll('-', '\\-')}['"]?: \\{`));
  }
  assert.match(constants, /TODO: refine with Sheree — brand voice owner/);
});

test('brief generation injects client-side variation and uses the requested Gemini model', () => {
  assert.match(aiService, /Math\.random\(\)/);
  assert.match(aiService, /pickRandom\(recipe\.situations\)/);
  assert.match(aiService, /pickRandom\(recipe\.axes\)/);
  assert.match(aiService, /model: 'gemini-flash-latest'/);
  assert.match(aiService, /temperature: 0\.95/);
  assert.match(aiService, /Never mention fonts, layout, colors, photos, or design/);
  assert.match(aiService, /must NEVER include verse wording — verse text is fetched server-side/);
  assert.match(aiService, /sanitizePII\(userMessage\)/);
  assert.match(aiService, /return sanitizePII\(text\)/);
});

test('Card Studio wires an editable suggested brief with guarded loading state', () => {
  assert.match(cardStudio, /import \{ generateCardBrief \} from '\.\.\/services\/aiService'/);
  assert.match(cardStudio, /const \[isSuggestingBrief, setIsSuggestingBrief\] = useState\(false\)/);
  assert.match(cardStudio, /setBrief\(suggestion\)/);
  assert.match(cardStudio, /scriptureMode: selectedBranch\.slug === 'rejoice' \? scripturePolicy : undefined/);
  assert.match(cardStudio, /disabled=\{isSuggestingBrief \|\| isGenerating \|\| !selectedBranch\}/);
  assert.match(cardStudio, /isSuggestingBrief \? 'Writing brief…' : 'Suggest brief'/);
});

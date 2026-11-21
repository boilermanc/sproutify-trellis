import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAIHandler } from '../supabase/functions/ai-generate/handler.mjs';
import { AI_CONFIGURED, aiStatus, aiKeyUpdate, validateAI } from '../supabase/functions/_shared/ai-contract.mjs';

function fixture({ user = true, member = true, secrets = { gemini_api_key: 'server-gemini', openai_api_key: 'server-openai', anthropic_api_key: 'server-claude' }, status = 200, fail = false, env = {} } = {}) {
  const calls = [];
  const createClient = () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: 'member-id' } : null } }) },
    from(table) {
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === 'trellis_users' ? (member ? { id: 'member-id' } : null) : secrets }) };
      return query;
    },
  });
  class GoogleGenAI {
    constructor({ apiKey }) { this.models = { generateContent: async params => {
      calls.push({ apiKey, ...params });
      if (fail) throw new Error('provider leaked server-gemini');
      return { text: 'Safe Gemini output' };
    } }; }
  }
  const handler = createAIHandler({ createClient, GoogleGenAI, env: name => env[name], fetch: async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json(status === 200 ? { choices: [{ message: { content: 'Safe OpenAI output' } }], content: [{ type: 'text', text: 'Safe Claude output' }] } : { error: 'server-openai' }, { status });
  } });
  return { calls, request: (body, auth = true) => handler(new Request('https://local/ai-generate', { method: 'POST', headers: auth ? { Authorization: 'Bearer user-session' } : {}, body: JSON.stringify(body) })) };
}

test('AI settings expose presence only; blank and marker saves preserve keys', () => {
  const status = aiStatus({ gemini_api_key: 'private-gemini' }, name => name === 'OPENAI_API_KEY' ? 'private-openai' : '');
  assert.deepEqual(status, { gemini_api_key: AI_CONFIGURED, openai_api_key: AI_CONFIGURED, anthropic_api_key: '' });
  for (const value of ['', undefined, AI_CONFIGURED]) assert.equal(aiKeyUpdate(value), undefined);
  assert.equal(aiKeyUpdate('replacement-key'), 'replacement-key');
  for (const value of [null, {}, 5, '   ', 'bad key']) assert.throws(() => aiKeyUpdate(value));
});

test('anonymous, expired sessions and nonmembers never call a provider', async () => {
  for (const [options, auth, status] of [[{}, false, 401], [{ user: false }, true, 401], [{ member: false }, true, 403]]) {
    const f = fixture(options);
    assert.equal((await f.request({ action: 'text', provider: 'openai', prompt: 'hello' }, auth)).status, status);
    assert.equal(f.calls.length, 0);
  }
});

for (const provider of ['gemini', 'openai', 'anthropic']) test(`${provider} uses server keys and returns text without credentials`, async () => {
  const f = fixture();
  const response = await f.request({ action: 'text', provider, prompt: 'Test 123-45-6789', systemPrompt: 'Do not store 4111 1111 1111 1111', apiKey: 'attacker-key', temperature: 0 });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.provider, provider);
  assert.ok(result.text);
  assert.ok(!JSON.stringify(result).includes('server-'));
  assert.ok(!JSON.stringify(f.calls).includes('attacker-key'));
  assert.ok(!JSON.stringify(f.calls).includes('123-45-6789'));
  assert.ok(!JSON.stringify(f.calls).includes('4111 1111 1111 1111'));
});

test('Gemini structured output survives while endpoint, tools and model overrides are ignored', async () => {
  const f = fixture({ env: { GEMINI_TEXT_MODEL: 'configured-model' } });
  const response = await f.request({ action: 'gemini', model: 'expensive-model', contents: 'Make JSON', config: {
    responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' } } },
    httpOptions: { baseUrl: 'https://attacker.test' }, tools: [{ urlContext: {} }], maxOutputTokens: 12000,
  } });
  assert.equal(response.status, 200);
  assert.equal(f.calls[0].model, 'configured-model');
  assert.equal(f.calls[0].config.responseSchema.properties.title.type, 'STRING');
  assert.equal(f.calls[0].config.tools, undefined);
  assert.equal(f.calls[0].config.httpOptions.baseUrl, undefined);
});

test('invalid input, missing key, provider errors and timeouts fail safely', async () => {
  const f = fixture();
  for (const body of [{}, { action: 'text', provider: 'other', prompt: 'x' }, { action: 'text', provider: 'openai', prompt: 'x', maxTokens: 999999 }, { action: 'gemini', contents: [{ fileData: { fileUri: 'https://attacker.test' } }] }]) {
    assert.equal((await f.request(body)).status, 400);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request({ prompt: 'x'.repeat(200001) })).status, 413);
  const missing = fixture({ secrets: {} });
  assert.equal((await missing.request({ action: 'text', provider: 'openai', prompt: 'test' })).status, 409);
  for (const options of [{ status: 429 }, { status: 401 }, { fail: true }]) {
    const f = fixture(options);
    const response = await f.request({ action: 'text', provider: options.fail ? 'gemini' : 'openai', prompt: 'test' });
    assert.ok(response.status >= 400);
    assert.ok(!(await response.text()).includes('server-'));
  }
});

test('frontend has no direct calls to the three AI providers', () => {
  for (const dir of ['.', 'services', 'pages', 'components']) for (const name of readdirSync(dir)) {
    if (!/\.tsx?$/.test(name)) continue;
    const source = readFileSync(`${dir}/${name}`, 'utf8');
    // constants.ts includes integration reference URLs, not executable clients.
    if (name === 'constants.ts') continue;
    assert.ok(!/new GoogleGenAI|generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com/.test(source), `${dir}/${name} contains a direct AI client`);
  }
});

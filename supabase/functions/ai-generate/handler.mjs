import { ORG_ID, sanitizeAI, validateAI } from '../_shared/ai-contract.mjs';

export function createAIHandler({ createClient, GoogleGenAI, env, fetch: fetchProvider = fetch }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');

  // Keep gateway JWT verification enabled. Also authenticate and authorize inside
  // the function: a valid Supabase session alone must not grant paid AI access.
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const authorization = req.headers.get('Authorization') || '';
      if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in to use AI.' }, 401);
      const userDb = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data: { user }, error: authError } = await userDb.auth.getUser();
      if (authError || !user) return json({ error: 'Sign in to use AI.' }, 401);
      const db = createClient(url, service, { auth: { persistSession: false } });
      const { data: member, error: memberError } = await db.from('trellis_users').select('id').eq('auth_user_id', user.id).eq('status', 'active').maybeSingle();
      if (memberError || !member) return json({ error: 'Active Trellis membership required.' }, 403);

      const raw = await req.text();
      if (raw.length > 200000) return json({ error: 'AI request is too large.' }, 413);
      let input;
      try { input = validateAI(JSON.parse(raw)); }
      catch (error) { return json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, 400); }
      const { data: secrets, error: secretsError } = await db.from('tenant_secrets')
        .select('gemini_api_key,openai_api_key,anthropic_api_key').eq('organization_id', ORG_ID).maybeSingle();
      if (secretsError) return json({ error: 'AI configuration could not be loaded.' }, 503);
      const field = `${input.provider}_api_key`;
      const apiKey = env(field.toUpperCase()) || secrets?.[field];
      if (!apiKey) return json({ error: 'This AI provider is not configured. Ask an admin to add its key in Settings.' }, 409);
      let text = '';
      if (input.provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
          model: env('GEMINI_TEXT_MODEL') || 'gemini-3.5-flash-lite',
          contents: input.action === 'gemini' ? input.contents : input.prompt,
          config: { ...(input.action === 'gemini' ? input.config : { systemInstruction: input.systemPrompt, temperature: input.temperature, maxOutputTokens: input.maxTokens }), httpOptions: { timeout: 90000 } },
        });
        text = result.text || '';
      } else {
        const openai = input.provider === 'openai';
        const response = await fetchProvider(openai ? 'https://api.openai.com/v1/chat/completions' : 'https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(90000),
          headers: openai ? { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` } : { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(openai ? {
            model: env('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
            messages: [...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []), { role: 'user', content: input.prompt }],
            max_tokens: input.maxTokens, temperature: input.temperature,
          } : {
            model: env('ANTHROPIC_TEXT_MODEL') || 'claude-haiku-4-5',
            system: input.systemPrompt, messages: [{ role: 'user', content: input.prompt }],
            max_tokens: input.maxTokens, temperature: input.temperature,
          }),
        });
        if (!response.ok) return json({ error: response.status === 429 ? 'AI provider is busy or its quota is exhausted. Try again later.' : 'AI provider rejected the request. Ask an admin to check its key, billing, and model.' }, response.status === 429 ? 429 : 502);
        const result = await response.json();
        text = openai ? result.choices?.[0]?.message?.content || '' : (result.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
      }
      if (!text) return json({ error: 'AI returned no text. Please try again.' }, 502);
      return json({ text: sanitizeAI(text), provider: input.provider });
    } catch {
      // Provider errors can contain credentials, prompts or request URLs.
      return json({ error: 'AI request failed or timed out. Please try again.' }, 502);
    }
  };
}
export const AI_CONFIGURED = '__configured_server_side__';
export const AI_FIELDS = ['gemini_api_key', 'openai_api_key', 'anthropic_api_key'];
export const ORG_ID = '00000000-0000-0000-0000-000000000001';

export function sanitizeAI(text) {
  return text.replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[REDACTED_CC]')
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[REDACTED_ID]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED_TOKEN]');
}

export function aiStatus(row, env = (_name) => '') {
  return Object.fromEntries(AI_FIELDS.map(field => [field,
    (env(field.toUpperCase()) || row?.[field]) ? AI_CONFIGURED : '',
  ]));
}

export function aiKeyUpdate(value) {
  if (value === undefined || value === '' || value === AI_CONFIGURED) return undefined;
  if (typeof value !== 'string' || value.length > 4096 || !value.trim() || /\s/.test(value)) {
    throw new Error('Invalid AI key.');
  }
  return value;
}

export function validateAI(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid AI request.');
  const bounded = (value, fallback, min, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid generation limit.');
    return value;
  };
  const text = value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 150000) throw new Error('A text prompt is required (maximum 150,000 characters).');
    return sanitizeAI(value);
  };
  if (body.action === 'text') {
    if (!['gemini', 'openai', 'anthropic'].includes(body.provider)) throw new Error('Unsupported AI provider.');
    return { action: 'text', provider: body.provider, prompt: text(body.prompt),
      systemPrompt: body.systemPrompt ? text(body.systemPrompt) : '',
      maxTokens: bounded(body.maxTokens, 1024, 1, 48000), temperature: bounded(body.temperature, 0.7, 0, 1) };
  }
  if (body.action !== 'gemini') throw new Error('Unsupported AI action.');
  // Only text generation is accepted. No file URLs, arbitrary external tools,
  // HTTP options, provider credentials, or client-selected endpoints cross here.
  const config = body.config || {};
  const safeConfig = {
    maxOutputTokens: bounded(config.maxOutputTokens, 8192, 1, 48000),
    temperature: bounded(config.temperature, 0.7, 0, 2),
    ...(config.systemInstruction ? { systemInstruction: text(config.systemInstruction) } : {}),
  };
  if (config.responseMimeType !== undefined) {
    if (!['application/json', 'text/plain'].includes(config.responseMimeType)) throw new Error('Unsupported response format.');
    safeConfig.responseMimeType = config.responseMimeType;
  }
  if (config.responseSchema !== undefined) {
    if (!config.responseSchema || typeof config.responseSchema !== 'object' || JSON.stringify(config.responseSchema).length > 20000) throw new Error('Invalid response schema.');
    safeConfig.responseSchema = config.responseSchema;
  }
  // Preserve Brand Intelligence's search-grounded fallback. Never forward
  // caller-supplied tool definitions or tool options to the provider.
  if (Array.isArray(config.tools) && config.tools.some(tool => tool && Object.hasOwn(tool, 'googleSearch'))) {
    safeConfig.tools = [{ googleSearch: {} }];
  }
  return { action: 'gemini', provider: 'gemini', contents: text(body.contents), config: safeConfig };
}

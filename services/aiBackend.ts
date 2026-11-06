import { supabase } from '../lib/supabase';
import type { GenerateContentParameters } from '@google/genai';

// A status marker, never a credential. Kept in the legacy string fields so
// existing studio availability checks do not need to receive provider secrets.
export const AI_CONFIGURED = '__configured_server_side__';

export async function invokeAI(body: unknown, signal?: AbortSignal) {
  const { data, error } = await supabase.functions.invoke('ai-generate', { body, signal });
  if (error) {
    // Read only the backend's deliberately safe error, never a provider response.
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.error || 'AI request failed. Please try again.');
  }
  if (data?.error || !data) throw new Error(data?.error || 'AI returned no response.');
  return data;
}

// Matches the small generateContent surface used by the studios. The SDK and
// provider credentials live on the server; client transport options stay local.
export function createBackendGemini() {
  return { models: { generateContent: async (params: GenerateContentParameters): Promise<{ text: string }> => {
    const { abortSignal, httpOptions: _http, ...config } = params.config || {};
    return invokeAI({ action: 'gemini', model: params.model, contents: params.contents, config }, abortSignal);
  } } };
}

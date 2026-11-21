import { Buffer } from 'node:buffer';

const extractAudio = result => {
  if (result?.interaction?.output_audio?.data) return result.interaction.output_audio.data;
  if (result?.output_audio?.data) return result.output_audio.data;
  if (Array.isArray(result?.steps)) {
    for (const step of result.steps) {
      const content = step?.model_output?.content || step?.content || [];
      const audio = (Array.isArray(content) ? content : []).find(item => item?.type === 'audio' && item?.data);
      if (audio?.data) return audio.data;
    }
  }
  return null;
};

export async function generateLyriaMusic({ apiKey, model, prompt, fetcher = fetch }) {
  if (!apiKey || !model || !prompt) throw new Error('Lyria generation configuration is incomplete.');
  const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ model, input: prompt, response_format: { type: 'audio' } }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Lyria ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  const encoded = extractAudio(result);
  if (!encoded) throw new Error('Lyria returned no audio bytes.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('Lyria returned empty audio bytes.');
  return {
    bytes, provider: 'google-lyria', model,
    provider_job_id: String(result?.interaction?.id || result?.id || `lyria-${Date.now()}`),
  };
}

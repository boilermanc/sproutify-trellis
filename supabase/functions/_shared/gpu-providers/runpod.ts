export interface RunPodConfig {
  apiKey: string;
  endpointId: string;
}

export interface RunPodJob {
  id: string;
  status: string;
  output?: unknown;
  error?: string;
  delayTime?: number;
  executionTime?: number;
}

async function runPodRequest(config: RunPodConfig, path: string, init?: RequestInit): Promise<RunPodJob> {
  const response = await fetch(`https://api.runpod.ai/v2/${config.endpointId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`RunPod request failed (${response.status}): ${String(payload?.error || payload?.message || "unknown error").slice(0, 300)}`);
  return payload as RunPodJob;
}

export function submitRunPodJob(config: RunPodConfig, input: Record<string, unknown>): Promise<RunPodJob> {
  return runPodRequest(config, "/run", { method: "POST", body: JSON.stringify({ input }) });
}

export function getRunPodJob(config: RunPodConfig, providerJobId: string): Promise<RunPodJob> {
  return runPodRequest(config, `/status/${encodeURIComponent(providerJobId)}`, { method: "GET" });
}

export function cancelRunPodJob(config: RunPodConfig, providerJobId: string): Promise<RunPodJob> {
  return runPodRequest(config, `/cancel/${encodeURIComponent(providerJobId)}`, { method: "POST" });
}

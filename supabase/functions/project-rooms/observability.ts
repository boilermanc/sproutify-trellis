import { ProviderFailure } from "./providers.ts";

export function failureDetails(error: unknown, provider?: string) {
  return {
    provider,
    code: error instanceof ProviderFailure
      ? error.code
      : error instanceof DOMException && error.name === "TimeoutError"
      ? "provider_timeout"
      : "step_failed",
    http_status: error instanceof ProviderFailure
      ? error.httpStatus
      : undefined,
  };
}

export function runLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: object,
) {
  console[level](
    JSON.stringify({ service: "project-rooms", event, ...fields }),
  );
}

type Incident = {
  room_id: string;
  run_id: string;
  stage?: string;
  elapsed_ms: number;
  failures: ReturnType<typeof failureDetails>[];
};

export async function alertBlockedRun(
  event: "run_blocked" | "run_state_save_failed" | "proposal_generation_failed" | "proposal_needs_rework",
  incident: Incident,
) {
  runLog("error", event, incident);
  const webhook = Deno.env.get("PROJECT_ROOM_ALERT_WEBHOOK_URL");
  const { room_id, run_id } = incident;
  try {
    if (!webhook) {
      runLog("warn", "alert_unconfigured", { room_id, run_id });
      return;
    }
    const url = new URL(webhook);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "project-rooms", event, ...incident }),
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    runLog(
      response.ok ? "info" : "error",
      response.ok ? "alert_accepted" : "alert_failed",
      {
        room_id,
        run_id,
        http_status: response.status,
      },
    );
  } catch {
    runLog("error", "alert_failed", { room_id, run_id });
  }
}

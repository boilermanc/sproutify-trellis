export const MEDIA_TASK_TYPES = [
  "text_to_video",
  "image_to_video",
  "audio_driven_avatar",
  "video_continuation",
] as const;

export type MediaTaskType = typeof MEDIA_TASK_TYPES[number];
export type MediaInputRole =
  | "reference_image"
  | "reference_video"
  | "driving_audio"
  | "source_image"
  | "source_video"
  | "first_frame"
  | "last_frame";

export interface MediaJobInput {
  asset_id: string;
  input_role: MediaInputRole;
  position?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateMediaJobRequest {
  project_id: string;
  scene_id?: string | null;
  model_id: string;
  provider?: string;
  task_type: MediaTaskType;
  prompt: string;
  negative_prompt?: string;
  parameters?: Record<string, unknown>;
  inputs?: MediaJobInput[];
  idempotency_key?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_ROLES = new Set<MediaInputRole>([
  "reference_image", "reference_video", "driving_audio", "source_image",
  "source_video", "first_frame", "last_frame",
]);

function requiredRoles(taskType: MediaTaskType): MediaInputRole[][] {
  if (taskType === "image_to_video") return [["source_image", "first_frame"]];
  if (taskType === "video_continuation") return [["source_video"]];
  if (taskType === "audio_driven_avatar") return [["reference_image"], ["driving_audio"]];
  return [];
}

export function validateCreateMediaJob(value: unknown): CreateMediaJobRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Job payload must be an object.");
  const body = value as Record<string, unknown>;
  if (!UUID.test(String(body.project_id || ""))) throw new Error("A valid project_id is required.");
  if (!String(body.model_id || "").trim()) throw new Error("A model_id is required.");
  if (!MEDIA_TASK_TYPES.includes(body.task_type as MediaTaskType)) throw new Error("Unsupported generation task type.");
  const prompt = String(body.prompt || "").trim();
  if (!prompt || prompt.length > 12000) throw new Error("Prompt must be between 1 and 12,000 characters.");
  if (body.parameters != null && (typeof body.parameters !== "object" || Array.isArray(body.parameters))) throw new Error("parameters must be an object.");

  const inputs = Array.isArray(body.inputs) ? body.inputs.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Input ${index + 1} is invalid.`);
    const item = raw as Record<string, unknown>;
    if (!UUID.test(String(item.asset_id || ""))) throw new Error(`Input ${index + 1} has an invalid asset_id.`);
    if (!INPUT_ROLES.has(item.input_role as MediaInputRole)) throw new Error(`Input ${index + 1} has an unsupported role.`);
    return {
      asset_id: String(item.asset_id),
      input_role: item.input_role as MediaInputRole,
      position: Math.max(0, Number(item.position || 0)),
      metadata: (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)) ? item.metadata as Record<string, unknown> : {},
    };
  }) : [];

  const roles = new Set(inputs.map(input => input.input_role));
  for (const alternatives of requiredRoles(body.task_type as MediaTaskType)) {
    if (!alternatives.some(role => roles.has(role))) throw new Error(`${body.task_type} requires ${alternatives.join(" or ")}.`);
  }

  if (body.model_id === "longcat-video-avatar-1.5") {
    if (body.task_type !== "audio_driven_avatar") throw new Error("LongCat Avatar 1.5 only supports audio-driven avatar jobs.");
    const parameters = (body.parameters || {}) as Record<string, unknown>;
    if (parameters.steps != null && Number(parameters.steps) !== 8) throw new Error("LongCat Avatar 1.5 requires exactly 8 inference steps.");
  }

  return {
    project_id: String(body.project_id),
    scene_id: body.scene_id ? String(body.scene_id) : null,
    model_id: String(body.model_id).trim(),
    provider: String(body.provider || "runpod").trim().toLowerCase(),
    task_type: body.task_type as MediaTaskType,
    prompt,
    negative_prompt: body.negative_prompt ? String(body.negative_prompt).trim().slice(0, 12000) : undefined,
    parameters: (body.parameters || {}) as Record<string, unknown>,
    inputs,
    idempotency_key: body.idempotency_key ? String(body.idempotency_key).trim().slice(0, 160) : undefined,
  };
}

export function runPodStatusToJobStatus(status: string): "submitted" | "running" | "succeeded" | "failed" | "cancelled" {
  switch (String(status || "").toUpperCase()) {
    case "IN_QUEUE": return "submitted";
    case "IN_PROGRESS": return "running";
    case "COMPLETED": return "succeeded";
    case "CANCELLED": return "cancelled";
    case "FAILED":
    case "TIMED_OUT":
    default: return "failed";
  }
}


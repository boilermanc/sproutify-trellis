import { runPodStatusToJobStatus, validateCreateMediaJob } from "./media-generation.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
};
const assertThrows = (fn: () => unknown, message: string) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw new Error(`Expected error containing ${JSON.stringify(message)}.`);
  }
  throw new Error("Expected function to throw.");
};

const projectId = "10000000-0000-4000-8000-000000000001";
const imageId = "10000000-0000-4000-8000-000000000002";
const audioId = "10000000-0000-4000-8000-000000000003";

Deno.test("validates LongCat image-to-video input", () => {
  const job = validateCreateMediaJob({
    project_id: projectId,
    model_id: "longcat-video-base",
    task_type: "image_to_video",
    prompt: "A farmer walks through a greenhouse.",
    inputs: [{ asset_id: imageId, input_role: "source_image" }],
  });
  assertEquals(job.provider, "runpod");
  assertEquals(job.inputs?.[0].input_role, "source_image");
});

Deno.test("Avatar 1.5 requires reference image, audio, and eight steps", () => {
  assertThrows(() => validateCreateMediaJob({
    project_id: projectId,
    model_id: "longcat-video-avatar-1.5",
    task_type: "audio_driven_avatar",
    prompt: "The presenter speaks to camera.",
    inputs: [{ asset_id: imageId, input_role: "reference_image" }],
  }), "driving_audio");

  assertThrows(() => validateCreateMediaJob({
    project_id: projectId,
    model_id: "longcat-video-avatar-1.5",
    task_type: "audio_driven_avatar",
    prompt: "The presenter speaks to camera.",
    parameters: { steps: 12 },
    inputs: [
      { asset_id: imageId, input_role: "reference_image" },
      { asset_id: audioId, input_role: "driving_audio" },
    ],
  }), "exactly 8");
});

Deno.test("normalizes RunPod queue lifecycle", () => {
  assertEquals(runPodStatusToJobStatus("IN_QUEUE"), "submitted");
  assertEquals(runPodStatusToJobStatus("IN_PROGRESS"), "running");
  assertEquals(runPodStatusToJobStatus("COMPLETED"), "succeeded");
  assertEquals(runPodStatusToJobStatus("TIMED_OUT"), "failed");
  assertEquals(runPodStatusToJobStatus("CANCELLED"), "cancelled");
});

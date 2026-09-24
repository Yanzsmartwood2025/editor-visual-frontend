import { describe, expect, it } from "vitest";
import {
  gpuVideoOptionsSchema,
  gpuVideoRequestSchema,
  GPU_VIDEO_RECIPE,
} from "../lib/gpu/videoContract";
import { resolveGpuExecutionPlan } from "../lib/gpu/planner";
const image = "https://example.com/photo.png";
describe("GPU video contract", () => {
  it("selects a real isolated video recipe and retains protected budgets", () => {
    const plan = resolveGpuExecutionPlan({
      workload: "video",
      recipe: GPU_VIDEO_RECIPE,
      prompt: "Gentle movement",
      inputUrls: [image],
    });
    expect(plan.recipePlan?.minInputs).toBe(1);
    expect(plan.profile).toMatchObject({
      minGpuRamGb: 24,
      minCpuRamGb: 64,
      backends: ["vast"],
      outputExtension: "mp4",
    });
    expect(plan.recipePlan?.bootstrapScript).toContain(
      "gpu-workers/wan22/run-job.py",
    );
  });
  it("rejects unsupported durations, frames and executable options before rental", () => {
    for (const options of [
      { duration: 60 },
      { steps: 1000 },
      { seed: -1 },
      { guidance: 20 },
      { command: "bash" },
      { orientation: "square" },
    ]) {
      expect(gpuVideoOptionsSchema.safeParse(options).success).toBe(false);
      expect(() =>
        resolveGpuExecutionPlan({
          workload: "video",
          recipe: GPU_VIDEO_RECIPE,
          prompt: "Move slowly",
          inputUrls: [image],
          options,
        }),
      ).toThrow();
    }
  });
  it("requires exactly one image and a non-empty prompt", () => {
    for (const inputUrls of [[], [image, image]])
      expect(() =>
        resolveGpuExecutionPlan({
          workload: "video",
          recipe: GPU_VIDEO_RECIPE,
          prompt: "Move",
          inputUrls,
        }),
      ).toThrow();
    expect(() =>
      resolveGpuExecutionPlan({
        workload: "video",
        recipe: GPU_VIDEO_RECIPE,
        inputUrls: [image],
      }),
    ).toThrow();
  });
  it("requires explicit selection for start and a scoped source ID", () => {
    const input = {
      projectId: "11111111-1111-4111-8111-111111111111",
      threadId: "22222222-2222-4222-8222-222222222222",
      mediaId: "33333333-3333-4333-8333-333333333333",
      prompt: "Natural movement",
      options: {},
      operation: "quote",
    };
    expect(gpuVideoRequestSchema.safeParse(input).success).toBe(true);
    expect(
      gpuVideoRequestSchema.safeParse({ ...input, operation: "start" }).success,
    ).toBe(false);
    expect(
      gpuVideoRequestSchema.safeParse({
        ...input,
        operation: "start",
        computeSelectionId: "a".repeat(43),
      }).success,
    ).toBe(true);
  });
});

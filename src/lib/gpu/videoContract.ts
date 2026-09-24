import { z } from "zod";
export const GPU_VIDEO_RECIPE = "wan22-image-to-video";
export const gpuVideoOptionsSchema = z
  .object({
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    duration: z.union([z.literal(3), z.literal(5)]).default(3),
    steps: z.union([z.literal(30), z.literal(50)]).default(30),
    guidance: z.number().min(1).max(7).default(5),
    seed: z.number().int().min(0).max(2147483647).default(42),
    negativePrompt: z
      .string()
      .max(1000)
      .default("blurry, distorted, low quality, text, watermark"),
    fit: z.enum(["contain", "cover"]).default("contain"),
  })
  .strict();
export type GpuVideoOptions = z.infer<typeof gpuVideoOptionsSchema>;
export const gpuVideoRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    threadId: z.string().uuid(),
    mediaId: z.string().uuid(),
    prompt: z.string().trim().min(3).max(1500),
    options: gpuVideoOptionsSchema,
    operation: z.enum(["quote", "start", "continue"]),
    jobId: z.string().uuid().optional(),
    computeSelectionId: z.string().min(20).max(128).optional(),
  })
  .refine(
    (value) => value.operation !== "continue" || !!value.jobId,
    "Falta la sesión GPU.",
  )
  .refine(
    (value) => value.operation !== "start" || !!value.computeSelectionId,
    "Primero elige una cotización GPU.",
  );
export function validateGpuVideoInput(input: {
  prompt?: string;
  options?: Record<string, unknown>;
}) {
  z.string().trim().min(3).max(1500).parse(input.prompt);
  return gpuVideoOptionsSchema.parse(input.options || {});
}

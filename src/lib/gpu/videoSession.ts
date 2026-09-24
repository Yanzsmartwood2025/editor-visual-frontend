import { randomUUID } from "node:crypto";
import { createR2StorageUrl } from "../r2";
import { getGpuSupabaseAdmin, type GpuJobRow } from "./jobStore";
import { GPU_VIDEO_RECIPE, validateGpuVideoInput } from "./videoContract";

export const VIDEO_IDLE_MS = 120_000;
export type VideoSession = {
  generationId: string;
  phase: "queued" | "generating" | "finalizing" | "idle" | "closing";
  hardDeadline: string;
  idleUntil?: string;
  clipStartedAt: string;
  clips: number;
};
export function newVideoSession(hardDeadline: string): VideoSession {
  return {
    generationId: randomUUID(),
    phase: "queued",
    hardDeadline,
    clipStartedAt: new Date().toISOString(),
    clips: 0,
  };
}
export function getVideoSession(job: GpuJobRow): VideoSession | null {
  return job.metadata?.request?.recipe === GPU_VIDEO_RECIPE
    ? job.metadata?.videoSession || null
    : null;
}
// Compare generation and phase as well as status: two tabs/callback retries cannot claim the same clip.
export async function updateVideoSession(
  job: GpuJobRow,
  patch: Record<string, unknown>,
) {
  const session = getVideoSession(job);
  if (!session) throw new Error("Sesión de video no disponible.");
  const { data, error } = await getGpuSupabaseAdmin()
    .from("gpu_jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("status", job.status)
    .eq("metadata->videoSession->>generationId", session.generationId)
    .eq("metadata->videoSession->>phase", session.phase)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as GpuJobRow | null;
}
export function canContinueVideo(job: GpuJobRow, now = Date.now()) {
  const s = getVideoSession(job);
  return (
    !!s &&
    s.phase === "idle" &&
    job.status === "processing" &&
    !job.destroyed_at &&
    !!job.instance_id &&
    Date.parse(s.idleUntil || "") > now &&
    Date.parse(s.hardDeadline) - now >= 5 * 60_000
  );
}
export async function continueVideoSession(
  job: GpuJobRow,
  input: {
    prompt: string;
    inputUrls: string[];
    options: Record<string, unknown>;
  },
) {
  if (!canContinueVideo(job))
    throw new Error(
      "La sesión ya cerró o no tiene tiempo suficiente. Inicia una nueva cotización.",
    );
  const options = validateGpuVideoInput(input);
  const previous = getVideoSession(job)!;
  const next = {
    ...previous,
    generationId: randomUUID(),
    phase: "queued" as const,
    idleUntil: undefined,
    clipStartedAt: new Date().toISOString(),
  };
  const outputKey = `${job.user_id}/projects/${job.project_id}/threads/${job.thread_id}/gpu/video/${job.id}-${next.generationId}.mp4`;
  const result = await updateVideoSession(job, {
    status: "processing",
    completed_at: null,
    gallery_item_id: null,
    error_message: null,
    output_url: createR2StorageUrl(outputKey),
    lease_expires_at: previous.hardDeadline,
    metadata: {
      ...job.metadata,
      outputKey,
      videoSession: next,
      request: { ...job.metadata.request, ...input, options },
    },
  });
  if (!result)
    throw new Error(
      "La sesión cambió. Consulta el estado antes de volver a enviar.",
    );
  return result;
}
export async function requestVideoSessionClose(job: GpuJobRow) {
  const s = getVideoSession(job);
  if (
    !s ||
    job.destroyed_at ||
    ["completed", "failed", "expired"].includes(job.status)
  )
    return;
  const completed = s.phase === "idle" && !!job.gallery_item_id;
  return updateVideoSession(job, {
    status: "cleanup_pending",
    lease_expires_at: new Date(Date.now() - 1000).toISOString(),
    error_message: completed ? null : "Cancelado por el usuario.",
    metadata: {
      ...job.metadata,
      cancelRequested: true,
      terminalStatus: completed ? "completed" : "failed",
      videoSession: { ...s, phase: "closing" },
    },
  });
}

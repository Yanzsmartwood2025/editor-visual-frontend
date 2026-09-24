import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireFirebaseUser } from "../../../lib/firebaseAdmin";
import {
  getOwnedMediaForUser,
  resolveOwnedWorkspaceScope,
} from "../../../lib/workspaceStore";
import { createR2PresignedGetUrl } from "../../../lib/r2";
import {
  GPU_VIDEO_RECIPE,
  gpuVideoRequestSchema,
} from "../../../lib/gpu/videoContract";
import { quoteComputeGpuJob } from "../../../lib/gpu/quote";
import {
  startComputeGpuJob,
  getGpuJobStatusForUser,
  cleanupExpiredComputeJobs,
} from "../../../lib/gpu/orchestrator";
import {
  getGpuJobForUser,
  getGpuSupabaseAdmin,
  updateGpuJobIfStatus,
} from "../../../lib/gpu/jobStore";
import { resolveRequestPublicBaseUrl } from "../../../lib/gpu/requestUrl";
import { sanitizeNaylaPublicText } from "../../../lib/naylaSystemCatalog";
export const config = { maxDuration: 120 };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res
      .status(401)
      .json({ error: "Inicia sesión para usar GPU Video." });
  }
  try {
    if (req.method === "GET" || req.method === "DELETE") {
      let id: string;
      if (req.method === "GET" && !req.query.id) {
        const scope = await resolveOwnedWorkspaceScope({
          userId: user.uid,
          projectId: z.string().uuid().parse(req.query.projectId),
          threadId: z.string().uuid().parse(req.query.threadId),
        });
        const { data, error } = await getGpuSupabaseAdmin()
          .from("gpu_jobs")
          .select("id")
          .eq("user_id", user.uid)
          .eq("project_id", scope.projectId)
          .eq("thread_id", scope.threadId)
          .contains("metadata", { request: { recipe: GPU_VIDEO_RECIPE } })
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        if (!data?.length) return res.status(200).json({ job: null });
        id = data[0].id;
      } else id = z.string().uuid().parse(req.query.id);
      const saved = await getGpuJobForUser(id, user.uid);
      if (!saved || saved.metadata?.request?.recipe !== GPU_VIDEO_RECIPE)
        return res.status(404).json({ error: "Video no encontrado." });
      if (
        req.method === "DELETE" &&
        !saved.gallery_item_id &&
        !["completed", "failed", "expired"].includes(saved.status)
      ) {
        if (!saved.instance_id)
          return res
            .status(409)
            .json({
              error:
                "La reserva sigue arrancando. Consulta el estado antes de cancelar.",
            });
        await updateGpuJobIfStatus(saved.id, saved.status, {
          lease_expires_at: new Date(Date.now() - 1000).toISOString(),
          status: "cleanup_pending",
          metadata: {
            ...saved.metadata,
            cancelRequested: true,
            terminalStatus: "failed",
          },
          error_message: "Cancelado por el usuario.",
        });
        await cleanupExpiredComputeJobs();
      }
      return res
        .status(200)
        .json({
          job: await getGpuJobStatusForUser({ jobId: id, userId: user.uid }),
        });
    }
    if (req.method !== "POST")
      return res.status(405).json({ error: "Método no permitido." });
    const input = gpuVideoRequestSchema.parse(req.body);
    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: input.projectId,
      threadId: input.threadId,
    });
    const media = await getOwnedMediaForUser({
      userId: user.uid,
      projectId: scope.projectId,
      mediaIds: [input.mediaId],
    });
    const photo = media[0];
    if (!photo || photo.tipo !== "foto")
      return res
        .status(404)
        .json({ error: "Selecciona una foto del proyecto activo." });
    const url = photo.r2_key
      ? createR2PresignedGetUrl({ key: photo.r2_key, expiresIn: 3600 }).url
      : photo.url;
    const request = {
      workload: "video" as const,
      recipe: GPU_VIDEO_RECIPE,
      prompt: input.prompt,
      inputUrls: [url],
      options: input.options,
      computeSelectionId: input.computeSelectionId,
    };
    if (input.operation === "quote") {
      return res
        .status(200)
        .json({
          quote: await quoteComputeGpuJob(request, input.computeSelectionId),
        });
    }
    const job = await startComputeGpuJob({
      userId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
      input: request,
      appBaseUrl: resolveRequestPublicBaseUrl(req),
    });
    return res.status(202).json({ job });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: "Revisa foto, prompt y opciones de video." });
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo completar la operación GPU.";
    return res.status(409).json({ error: sanitizeNaylaPublicText(message) });
  }
}

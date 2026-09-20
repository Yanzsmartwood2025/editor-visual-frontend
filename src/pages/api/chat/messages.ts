import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { listThreadMessagesForUser } from '../../../lib/workspaceStore';
import { sanitizeNaylaPublicText } from '../../../lib/naylaSystemCatalog';
import { refreshMediaJobForUser } from '../../../lib/mediaJobExecution';

const querySchema = z.object({
  threadId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const parsed = querySchema.safeParse({
    threadId: Array.isArray(req.query.threadId) ? req.query.threadId[0] : req.query.threadId,
    limit: Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
  });
  if (!parsed.success) return res.status(400).json({ error: 'Parámetros de chat inválidos.' });

  try {
    const result = await listThreadMessagesForUser({
      userId: user.uid,
      threadId: parsed.data.threadId,
      limit: parsed.data.limit,
    });
    const mediaJobIds = Array.from(new Set(
      result.messages
        .map((message: Record<string, any>) =>
          message.action && typeof message.action === 'object'
            ? message.action.mediaJobId
            : null
        )
        .filter((id: unknown): id is string => typeof id === 'string')
    )).slice(0, 20);

    const liveMediaJobs = new Map<string, any>();
    await Promise.all(
      mediaJobIds.map(async (jobId) => {
        try {
          const job = await refreshMediaJobForUser({
            userId: user.uid,
            jobId,
          });
          liveMediaJobs.set(jobId, job);
        } catch (error) {
          console.warn('[chat/messages] No se pudo refrescar un trabajo Cloud:', error);
        }
      })
    );

    const messages = result.messages.map((message: Record<string, any>) => {
      const rawAction = message.action && typeof message.action === 'object'
        ? message.action as Record<string, any>
        : null;
      const liveMediaJob =
        rawAction?.mediaJobId && liveMediaJobs.has(rawAction.mediaJobId)
          ? liveMediaJobs.get(rawAction.mediaJobId)
          : null;
      const publicAction = rawAction
        ? {
            action: rawAction.action,
            status: liveMediaJob?.status || rawAction.status,
            engine:
              rawAction.engine === 'nayla-compute' || rawAction.action === 'RUN_GPU_JOB'
                ? 'nayla-compute'
                : 'nayla-cloud',
            gpuJobId: rawAction.gpuJobId,
            mediaJobId: rawAction.mediaJobId,
            gpuName: rawAction.job?.gpuName ?? rawAction.quote?.gpuName ?? rawAction.gpuName ?? null,
            hourlyPrice:
              rawAction.job?.hourlyPrice ?? rawAction.quote?.hourlyPrice ?? rawAction.hourlyPrice ?? null,
            estimatedMaxCost:
              rawAction.job?.estimatedMaxCost ?? rawAction.quote?.estimatedMaxCost ?? rawAction.estimatedMaxCost ?? null,
            runtimeCostEstimate:
              rawAction.job?.runtimeCostEstimate ?? rawAction.runtimeCostEstimate ?? null,
            outputUrl: liveMediaJob?.outputUrl ?? rawAction.outputUrl ?? null,
            textOutput: liveMediaJob?.textOutput ?? rawAction.textOutput ?? null,
          }
        : null;

      return {
        ...message,
        content: sanitizeNaylaPublicText(String(message.content || '')),
        action: publicAction,
      };
    });

    return res.status(200).json({
      projectId: result.scope.projectId,
      threadId: result.scope.threadId,
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo leer el historial.';
    const status = message.includes('no existe') || message.includes('no pertenece') ? 404 : 500;
    return res.status(status).json({ error: message });
  }
}

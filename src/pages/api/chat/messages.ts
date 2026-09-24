import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  getOwnedMediaForUser,
  getWorkspaceSupabaseAdmin,
  insertChatMessageForUser,
  listThreadMessagesForUser,
  resolveOwnedWorkspaceScope,
} from '../../../lib/workspaceStore';
import { createR2PresignedGetUrl } from '../../../lib/r2';
import { sanitizeNaylaPublicText } from '../../../lib/naylaSystemCatalog';
import { refreshMediaJobForUser } from '../../../lib/mediaJobExecution';

const querySchema = z.object({
  threadId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const postSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  attachmentIds: z.array(z.string().uuid()).min(1).max(200),
  content: z.string().trim().max(1000).optional(),
});

const hydrateMedia = (item: Record<string, any>) => ({
  id: item.id,
  tipo: item.tipo,
  nombre: item.nombre,
  etiqueta: item.etiqueta,
  fuente: item.fuente,
  metadata: item.metadata || {},
  url: item.r2_key
    ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
    : item.url,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  if (req.method === 'POST') {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de adjuntos inválidos.' });
    }

    try {
      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: parsed.data.projectId,
        threadId: parsed.data.threadId,
      });
      const uniqueIds = Array.from(new Set(parsed.data.attachmentIds));
      const media = await getOwnedMediaForUser({
        userId: user.uid,
        mediaIds: uniqueIds,
        projectId: scope.projectId,
      });

      if (media.length !== uniqueIds.length) {
        return res.status(403).json({ error: 'Uno o más archivos no pertenecen al proyecto activo.' });
      }

      const labels = media
        .map((item: Record<string, any>) => item.etiqueta || item.nombre)
        .filter(Boolean);
      const content = parsed.data.content || `Archivos añadidos: ${labels.join(', ')}`;

      const message = await insertChatMessageForUser({
        userId: user.uid,
        projectId: scope.projectId,
        threadId: scope.threadId!,
        role: 'user',
        content,
        attachmentIds: uniqueIds,
        metadata: {
          responseType: 'media-upload',
          attachmentTypes: media.map((item: Record<string, any>) => item.tipo),
        },
      });

      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(201).json({
        projectId: scope.projectId,
        threadId: scope.threadId,
        message: {
          ...message,
          attachments: media.map(hydrateMedia),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar los archivos en el chat.';
      const status = /no pertenece|no existe/i.test(message) ? 403 : 500;
      return res.status(status).json({ error: status === 403 ? message : 'No se pudo registrar los archivos en el chat.' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET o POST.' });

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

    const messageIds = result.messages
      .map((message: Record<string, any>) => message.id)
      .filter((id: unknown): id is string => typeof id === 'string');

    const attachmentsByMessage = new Map<string, any[]>();
    if (messageIds.length) {
      const supabase = getWorkspaceSupabaseAdmin();
      const { data: links, error: linksError } = await supabase
        .from('chat_message_media')
        .select('message_id,media_id')
        .eq('user_id', user.uid)
        .in('message_id', messageIds);

      if (linksError) throw linksError;

      const mediaIds = Array.from(new Set(
        (links || [])
          .map((link: Record<string, any>) => link.media_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      ));

      const media = mediaIds.length
        ? await getOwnedMediaForUser({
            userId: user.uid,
            mediaIds,
            projectId: result.scope.projectId,
          })
        : [];
      const mediaById = new Map(media.map((item: Record<string, any>) => [item.id, hydrateMedia(item)]));

      (links || []).forEach((link: Record<string, any>) => {
        const item = mediaById.get(link.media_id);
        if (!item) return;
        const current = attachmentsByMessage.get(link.message_id) || [];
        current.push(item);
        attachmentsByMessage.set(link.message_id, current);
      });
    }

    const editorPlanIds = result.messages.map((message: any) => message.metadata?.editorReview?.id).filter(Boolean);
    const editorStatuses = new Map<string, string>();
    if (editorPlanIds.length) {
      const { data: plans, error } = await getWorkspaceSupabaseAdmin().from('nayla_action_plans')
        .select('id,status,expires_at').eq('user_id', user.uid).eq('module', 'editor').eq('thread_key', parsed.data.threadId).in('id', editorPlanIds);
      if (error) throw error;
      for (const plan of plans || []) editorStatuses.set(plan.id, plan.status === 'pending' && Date.parse(plan.expires_at) > Date.now() ? 'pending' : ['completed', 'executing'].includes(plan.status) ? 'accepted' : 'cancelled');
    }

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
        metadata: message.metadata?.editorReview ? { ...message.metadata, editorReview: { ...message.metadata.editorReview, status: editorStatuses.get(message.metadata.editorReview.id) || 'cancelled' } } : message.metadata,
        content: sanitizeNaylaPublicText(String(message.content || '')),
        action: publicAction,
        attachments: attachmentsByMessage.get(message.id) || [],
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

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { createR2PresignedGetUrl, createR2StorageUrl } from '../../lib/r2';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from '../../lib/workspaceStore';

const mediaIdsFromTimeline = (timeline: unknown[]) =>
  Array.from(new Set(
    timeline
      .map((item) => (
        item && typeof item === 'object' && 'mediaId' in item
          ? String((item as { mediaId?: unknown }).mediaId || '')
          : ''
      ))
      .filter(Boolean)
  ));

const getProjectMediaMap = async ({
  userId,
  projectId,
  mediaIds,
}: {
  userId: string;
  projectId: string;
  mediaIds: string[];
}) => {
  if (!mediaIds.length) return new Map<string, Record<string, any>>();
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('galeria_multimedia')
    .select('id, url, r2_key')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .in('id', mediaIds);

  if (error) throw error;
  return new Map((data || []).map((item) => [item.id as string, item as Record<string, any>]));
};

const hydrateTimeline = async ({
  userId,
  projectId,
  timeline,
}: {
  userId: string;
  projectId: string;
  timeline: unknown[];
}) => {
  const mediaMap = await getProjectMediaMap({
    userId,
    projectId,
    mediaIds: mediaIdsFromTimeline(timeline),
  });

  return timeline.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as Record<string, any>;
    const media = typeof item.mediaId === 'string' ? mediaMap.get(item.mediaId) : undefined;
    if (!media) return item;

    return {
      ...item,
      url: media.r2_key
        ? createR2PresignedGetUrl({ key: media.r2_key, expiresIn: 3600 }).url
        : media.url,
    };
  });
};

const canonicalizeTimeline = async ({
  userId,
  projectId,
  timeline,
}: {
  userId: string;
  projectId: string;
  timeline: unknown[];
}) => {
  const mediaMap = await getProjectMediaMap({
    userId,
    projectId,
    mediaIds: mediaIdsFromTimeline(timeline),
  });

  return timeline.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as Record<string, any>;
    const media = typeof item.mediaId === 'string' ? mediaMap.get(item.mediaId) : undefined;
    if (!media?.r2_key) return item;

    return {
      ...item,
      url: createR2StorageUrl(media.r2_key),
    };
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireFirebaseUser(req);
    const supabase = getWorkspaceSupabaseAdmin();

    if (req.method === 'GET') {
      const projectId = Array.isArray(req.query.projectId)
        ? req.query.projectId[0]
        : req.query.projectId;

      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: typeof projectId === 'string' ? projectId : undefined,
      });

      const { data, error } = await supabase
        .from('editor_projects')
        .select('id, linea_de_tiempo, updated_at')
        .eq('id', scope.projectId)
        .eq('user_id', user.uid)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Proyecto no encontrado.' });

      const timeline = Array.isArray(data.linea_de_tiempo) ? data.linea_de_tiempo : [];
      const hydratedTimeline = await hydrateTimeline({
        userId: user.uid,
        projectId: data.id,
        timeline,
      });

      return res.status(200).json({
        projectId: data.id,
        data: {
          linea_de_tiempo: hydratedTimeline,
          updated_at: data.updated_at,
        },
      });
    }

    if (req.method === 'PUT') {
      const { projectId, linea_de_tiempo } = req.body || {};
      if (!Array.isArray(linea_de_tiempo)) {
        return res.status(400).json({ error: 'Se requiere linea_de_tiempo.' });
      }

      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: typeof projectId === 'string' ? projectId : undefined,
      });

      const canonicalTimeline = await canonicalizeTimeline({
        userId: user.uid,
        projectId: scope.projectId,
        timeline: linea_de_tiempo,
      });

      const updatedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('editor_projects')
        .update({
          linea_de_tiempo: canonicalTimeline,
          updated_at: updatedAt,
        })
        .eq('id', scope.projectId)
        .eq('user_id', user.uid)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Proyecto no encontrado.' });

      return res.status(200).json({
        success: true,
        projectId: data.id,
        updated_at: updatedAt,
      });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Error interno del servidor.');
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase')
      ? 401
      : message.includes('no pertenece') || message.includes('no existe')
        ? 403
        : 500;
    console.error('Error en /api/proyectos:', error);
    return res.status(status).json({ error: message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { createR2PresignedGetUrl, createR2StorageUrl, deleteR2Object } from '../../lib/r2';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from '../../lib/workspaceStore';

const publicSourceName = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (/vast|runpod|gpu:/i.test(value)) return 'nayla-compute';
  if (/fal|replicate|deepgram|cartesia|elevenlabs|tripo|meshy/i.test(value)) return 'nayla-cloud';
  return value;
};

const hydratePrivateUrl = (item: Record<string, any>) => {
  const metadata = {
    ...(item?.metadata || {}),
    ...(item?.metadata?.sourceProvider
      ? { sourceProvider: publicSourceName(item.metadata.sourceProvider) }
      : {}),
  };
  const publicItem = {
    ...item,
    fuente: publicSourceName(item?.fuente),
    metadata,
  };

  if (!item?.r2_key) return publicItem;
  return {
    ...publicItem,
    url: createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url,
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireFirebaseUser(req);
    const supabase = getWorkspaceSupabaseAdmin();

    if (req.method === 'GET') {
      const projectId = Array.isArray(req.query.projectId) ? req.query.projectId[0] : req.query.projectId;
      const threadId = Array.isArray(req.query.threadId) ? req.query.threadId[0] : req.query.threadId;
      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: typeof projectId === 'string' ? projectId : undefined,
        threadId: typeof threadId === 'string' ? threadId : undefined,
      });

      let query = supabase
        .from('galeria_multimedia')
        .select('*')
        .eq('user_id', user.uid)
        .eq('project_id', scope.projectId)
        .order('creado_en', { ascending: true });

      if (scope.threadId) query = query.eq('thread_id', scope.threadId);

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({
        projectId: scope.projectId,
        threadId: scope.threadId || null,
        data: (data || []).map(hydratePrivateUrl),
      });
    }

    if (req.method === 'POST') {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: 'Se requiere al menos un elemento de galería.' });

      const first = items[0] || {};
      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: req.body?.projectId || first.project_id,
        threadId: req.body?.threadId || first.thread_id,
      });

      const rows = items.map((item: Record<string, any>) => {
        const r2Key = typeof item.r2_key === 'string' ? item.r2_key : null;
        if (r2Key && !r2Key.startsWith(`${user.uid}/`)) {
          throw new Error('La clave R2 no pertenece al usuario autenticado.');
        }

        return {
          id: item.id,
          user_id: user.uid,
          project_id: scope.projectId,
          thread_id: scope.threadId || null,
          url: r2Key ? createR2StorageUrl(r2Key) : item.url,
          r2_key: r2Key,
          privacy: r2Key ? 'private' : (item.privacy || 'private'),
          tipo: item.tipo,
          nombre: item.nombre,
          creado_en: item.creado_en || new Date().toISOString(),
          esOverlay: Boolean(item.esOverlay),
          etiqueta: item.etiqueta || null,
          fuente: item.fuente || null,
          memoria_id: item.memoria_id || null,
          metadata: item.metadata || {},
        };
      });

      const { data, error } = await supabase
        .from('galeria_multimedia')
        .insert(rows)
        .select();
      if (error) throw error;

      return res.status(201).json({
        projectId: scope.projectId,
        threadId: scope.threadId || null,
        data: (data || []).map(hydratePrivateUrl),
      });
    }

    if (req.method === 'PATCH') {
      const { id, nombre } = req.body || {};
      if (typeof id !== 'string' || typeof nombre !== 'string') {
        return res.status(400).json({ error: 'Se requieren id y nombre.' });
      }

      const { data, error } = await supabase
        .from('galeria_multimedia')
        .update({ nombre })
        .eq('id', id)
        .eq('user_id', user.uid)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Archivo no encontrado.' });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      if (!ids.length) return res.status(400).json({ error: 'Se requiere al menos un id.' });

      const { data: ownedItems, error: lookupError } = await supabase
        .from('galeria_multimedia')
        .select('id,r2_key')
        .in('id', ids)
        .eq('user_id', user.uid);

      if (lookupError) throw lookupError;
      if (!ownedItems?.length) return res.status(404).json({ error: 'Archivo no encontrado.' });

      const privateKeys = ownedItems
        .map((item: any) => typeof item.r2_key === 'string' ? item.r2_key : null)
        .filter((key: string | null): key is string => Boolean(key));

      for (const key of privateKeys) {
        if (!key.startsWith(`${user.uid}/`)) {
          throw new Error('La clave R2 no pertenece al usuario autenticado.');
        }
        await deleteR2Object(key);
      }

      const ownedIds = ownedItems.map((item: any) => item.id);
      const { error } = await supabase
        .from('galeria_multimedia')
        .delete()
        .in('id', ownedIds)
        .eq('user_id', user.uid);

      if (error) throw error;
      return res.status(200).json({ success: true, deletedIds: ownedIds });
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
    console.error('Error en /api/galeria:', error);
    return res.status(status).json({ error: message });
  }
}

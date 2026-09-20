import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from '../../lib/workspaceStore';

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

      return res.status(200).json({
        projectId: data.id,
        data: {
          linea_de_tiempo: data.linea_de_tiempo || [],
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

      const updatedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('editor_projects')
        .update({
          linea_de_tiempo,
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

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  createThreadForUser,
  listThreadsForUser,
  updateThreadForUser,
} from '../../../lib/workspaceStore';

const querySchema = z.object({ projectId: z.string().uuid() });
const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
});
const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).refine((value) => value.title !== undefined || value.status !== undefined, {
  message: 'No hay cambios para guardar.',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  try {
    if (req.method === 'GET') {
      const projectId = Array.isArray(req.query.projectId) ? req.query.projectId[0] : req.query.projectId;
      const parsed = querySchema.safeParse({ projectId });
      if (!parsed.success) return res.status(400).json({ error: 'Falta projectId válido.' });
      const threads = await listThreadsForUser({ userId: user.uid, projectId: parsed.data.projectId });
      return res.status(200).json({ threads });
    }

    if (req.method === 'POST') {
      const parsed = createSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Chat inválido.' });
      const thread = await createThreadForUser({
        userId: user.uid,
        projectId: parsed.data.projectId,
        title: parsed.data.title,
      });
      return res.status(201).json({ thread });
    }

    if (req.method === 'PATCH') {
      const parsed = updateSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Cambio inválido.' });
      const thread = await updateThreadForUser({
        userId: user.uid,
        threadId: parsed.data.id,
        title: parsed.data.title,
        status: parsed.data.status,
      });
      return res.status(200).json({ thread });
    }

    return res.status(405).json({ error: 'Usa GET, POST o PATCH.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo gestionar el chat.';
    const status = message.includes('no existe') || message.includes('no pertenece') ? 404 : 500;
    return res.status(status).json({ error: message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import {
  createProjectForUser,
  listProjectsForUser,
  updateProjectForUser,
} from '../../lib/workspaceStore';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).refine((value) => value.name !== undefined || value.status !== undefined, {
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
      const projects = await listProjectsForUser(user.uid);
      return res.status(200).json({ projects });
    }

    if (req.method === 'POST') {
      const parsed = createSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Proyecto inválido.' });
      const project = await createProjectForUser({ userId: user.uid, name: parsed.data.name });
      return res.status(201).json({ project });
    }

    if (req.method === 'PATCH') {
      const parsed = updateSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Cambio inválido.' });
      const project = await updateProjectForUser({
        userId: user.uid,
        projectId: parsed.data.id,
        name: parsed.data.name,
        status: parsed.data.status,
      });
      return res.status(200).json({ project });
    }

    return res.status(405).json({ error: 'Usa GET, POST o PATCH.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo gestionar el proyecto.';
    return res.status(500).json({ error: message });
  }
}

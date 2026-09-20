import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { listThreadMessagesForUser } from '../../../lib/workspaceStore';

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
    return res.status(200).json({
      projectId: result.scope.projectId,
      threadId: result.scope.threadId,
      messages: result.messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo leer el historial.';
    const status = message.includes('no existe') || message.includes('no pertenece') ? 404 : 500;
    return res.status(status).json({ error: message });
  }
}

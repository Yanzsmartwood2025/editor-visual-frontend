import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { getMediaJobForUser } from '../../../lib/mediaJobs';

const querySchema = z.object({ id: z.string().uuid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const parsed = querySchema.safeParse({
    id: Array.isArray(req.query.id) ? req.query.id[0] : req.query.id,
  });
  if (!parsed.success) return res.status(400).json({ error: 'Falta un id de trabajo válido.' });

  try {
    const job = await getMediaJobForUser({ userId: user.uid, jobId: parsed.data.id });
    if (!job) return res.status(404).json({ error: 'Trabajo multimedia no encontrado.' });
    return res.status(200).json({ job });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo leer el trabajo.' });
  }
}

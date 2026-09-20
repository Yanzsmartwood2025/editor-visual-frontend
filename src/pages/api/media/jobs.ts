import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  refreshMediaJobForUser,
  startMediaJobForUser,
} from '../../../lib/mediaJobExecution';

const idSchema = z.object({ id: z.string().uuid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const parsed = idSchema.safeParse(
    req.method === 'GET'
      ? { id: Array.isArray(req.query.id) ? req.query.id[0] : req.query.id }
      : { id: req.body?.id }
  );
  if (!parsed.success) {
    return res.status(400).json({ error: 'Falta un id de trabajo válido.' });
  }

  try {
    if (req.method === 'POST') {
      const job = await startMediaJobForUser({
        userId: user.uid,
        jobId: parsed.data.id,
      });
      return res.status(job.status === 'failed' ? 422 : 202).json({
        job,
        mediaJobId: job.id,
        text:
          job.status === 'completed'
            ? job.textOutput
              ? 'Nayla Cloud terminó la tarea.'
              : 'Nayla Cloud terminó la generación y guardó el resultado en la Bóveda.'
            : job.status === 'failed'
              ? (job.error || 'Nayla Cloud no pudo iniciar la tarea.')
              : 'Nayla Cloud inició la tarea. Puedes seguir su progreso desde este chat.',
      });
    }

    if (req.method === 'GET') {
      const job = await refreshMediaJobForUser({
        userId: user.uid,
        jobId: parsed.data.id,
      });
      return res.status(200).json({
        job,
        mediaJobId: job.id,
        text:
          job.status === 'completed'
            ? job.textOutput
              ? job.textOutput
              : 'Nayla Cloud terminó la generación y guardó el resultado en la Bóveda.'
            : job.status === 'failed'
              ? (job.error || 'Nayla Cloud no pudo completar la tarea.')
              : 'Nayla Cloud sigue trabajando.',
      });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo procesar el trabajo.';
    return res.status(500).json({ error: message });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../../lib/firebaseAdmin';
import { cancelGpuJobForUser } from '../../../../lib/gpu/orchestrator';

const requestSchema = z.object({
  jobId: z.string().uuid(),
  confirmDestroy: z.literal(true),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  let user;
  try { user = await requireFirebaseUser(req); }
  catch { return res.status(401).json({ error: 'Token Firebase inválido.' }); }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirma la cancelación y destrucción de la GPU.' });

  try {
    const job = await cancelGpuJobForUser({ jobId: parsed.data.jobId, userId: user.uid });
    return res.status(200).json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cancelar el trabajo GPU.';
    return res.status(message === 'Trabajo GPU no encontrado.' ? 404 : 500).json({ error: message });
  }
}

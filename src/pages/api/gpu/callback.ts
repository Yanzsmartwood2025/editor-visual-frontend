import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { finishGpuJob } from '../../../lib/gpu/orchestrator';

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['completed', 'failed']),
  error: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const bearerToken = (req: NextApiRequest) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim();
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const parsed = schema.safeParse(req.body);
  const token = bearerToken(req);

  if (!parsed.success || !token) {
    return res.status(401).json({ error: 'Callback GPU inválido.' });
  }

  try {
    const job = await finishGpuJob({
      jobId: parsed.data.jobId,
      token,
      status: parsed.data.status,
      error: parsed.data.error,
      metadata: parsed.data.metadata,
    });
    return res.status(200).json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cerrar el trabajo GPU.';
    const status = message.includes('Token') || message.includes('encontrado') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}

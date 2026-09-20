import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getGpuManifest } from '../../../lib/gpu/orchestrator';

const schema = z.object({
  jobId: z.string().uuid(),
});

const bearerToken = (req: NextApiRequest) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim();
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  const parsed = schema.safeParse({
    jobId: Array.isArray(req.query.jobId) ? req.query.jobId[0] : req.query.jobId,
  });
  const token = bearerToken(req);

  if (!parsed.success || !token) {
    return res.status(401).json({ error: 'Credencial GPU inválida.' });
  }

  try {
    const manifest = await getGpuManifest({
      jobId: parsed.data.jobId,
      token,
    });
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo obtener el manifiesto GPU.';
    const status = message.includes('Token') || message.includes('encontrado') ? 401 : 410;
    return res.status(status).json({ error: message });
  }
}

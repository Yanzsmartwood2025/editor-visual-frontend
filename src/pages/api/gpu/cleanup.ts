import type { NextApiRequest, NextApiResponse } from 'next';
import { cleanupExpiredComputeJobs } from '../../../lib/gpu/orchestrator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa GET o POST.' });
  }

  try {
    const result = await cleanupExpiredComputeJobs();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo ejecutar la limpieza GPU.';
    return res.status(500).json({ error: message });
  }
}

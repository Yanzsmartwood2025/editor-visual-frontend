import type { NextApiRequest, NextApiResponse } from 'next';
import { getNaylaPlayHealth } from '../../../lib/play/quote';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Usa GET.' });
  }

  try {
    const health = await getNaylaPlayHealth();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(health);
  } catch {
    return res.status(200).json({
      ready: false,
      networksConfigured: 0,
      networksReachable: 0,
      offers: 0,
      errors: 1,
    });
  }
}

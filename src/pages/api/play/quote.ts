import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { quoteNaylaPlay } from '../../../lib/play/quote';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Usa GET.' });
  }

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  try {
    const quote = await quoteNaylaPlay();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ quote });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo consultar Nayla Play.';
    return res.status(500).json({ error: message });
  }
}

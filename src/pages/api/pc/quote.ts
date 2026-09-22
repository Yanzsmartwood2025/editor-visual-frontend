import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { quoteNaylaPc } from '../../../lib/pc/quote';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa POST.' });
  }

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  try {
    const quote = await quoteNaylaPc(req.body || {});
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ quote });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo cotizar Nayla PC.';
    return res.status(500).json({ error: message });
  }
}

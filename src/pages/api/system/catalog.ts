import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { getNaylaPublicSystemCatalog } from '../../../lib/naylaSystemCatalog';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json(getNaylaPublicSystemCatalog());
}

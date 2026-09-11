import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { deleteR2Object } from '../../../lib/r2';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Usa DELETE.' });
  try {
    const user = await requireFirebaseUser(req);
    const { key } = req.body as { key?: string };
    if (!key || key.includes('..') || !key.startsWith(`${user.uid}/`)) return res.status(400).json({ error: 'Se requiere una clave R2 válida.' });
    await deleteR2Object(key);
    return res.status(200).json({ deleted: true });
  } catch (error: unknown) {
    return res.status(401).json({ error: error instanceof Error ? error.message : 'No autorizado.' });
  }
}

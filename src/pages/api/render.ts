import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { startVercelSandboxRender } from '../../lib/vercelSandboxRender';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  try {
    // Tomamos inputProps, que contiene el array timeline o props estáticos que pasaremos a remotion
    const { inputProps } = req.body;
    if (!inputProps) return res.status(400).json({ error: 'Faltan inputProps para el render.' });

    await requireFirebaseUser(req);
    const data = await startVercelSandboxRender(inputProps);
    return res.status(data.status === 'completed' ? 200 : 202).json(data);

  } catch (error: unknown) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error iniciando el renderizado.' });
  }
}

import { timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  progressNaylaPcBaseBuild,
  startNaylaPcBaseBuild,
} from '../../../lib/pc/baseBuilder';
import { getNaylaInternalSecret } from '../../../lib/pc/store';

const sameSecret = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const provided = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const expected = await getNaylaInternalSecret('pc_base_builder');

  if (!provided || !expected || !sameSecret(provided, expected)) {
    return res.status(404).json({ error: 'No disponible.' });
  }

  const action =
    typeof req.query.action === 'string'
      ? req.query.action.trim().toLowerCase()
      : 'status';

  try {
    const result =
      action === 'start'
        ? await startNaylaPcBaseBuild()
        : await progressNaylaPcBaseBuild();
    return res.status(action === 'start' ? 201 : 200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falló Nayla Base.',
    });
  }
}

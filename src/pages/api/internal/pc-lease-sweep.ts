import { timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  finalizePendingNaylaPcSnapshots,
  progressNaylaPcSaveRequests,
  sweepExpiredNaylaPcInstances,
} from '../../../lib/pc/instances';
import { getNaylaInternalSecret } from '../../../lib/pc/store';

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const config = {
  maxDuration: 60,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const provided = String(req.headers['x-nayla-cron-token'] || '').trim();
  const expected = await getNaylaInternalSecret('pc_lease_sweep');

  if (!provided || !expected || !safeEqual(provided, expected)) {
    return res.status(404).json({ error: 'No disponible.' });
  }

  try {
    const [leases, saves] = await Promise.all([
      sweepExpiredNaylaPcInstances(),
      progressNaylaPcSaveRequests(),
    ]);
    const snapshots = await finalizePendingNaylaPcSnapshots();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      ok: true,
      leases,
      saves,
      snapshots,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo ejecutar la limpieza de Nayla PC.';
    return res.status(500).json({ error: message });
  }
}

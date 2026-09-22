import { timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { progressNaylaPcBaseBuild } from '../../../lib/pc/baseBuilder';
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
    const baseBuildActive = await getNaylaInternalSecret('pc_base_build_active');
    const [leases, saves, baseBuild] = await Promise.all([
      sweepExpiredNaylaPcInstances(),
      progressNaylaPcSaveRequests(),
      baseBuildActive
        ? progressNaylaPcBaseBuild()
        : Promise.resolve({ state: 'idle' as const }),
    ]);
    const snapshots = await finalizePendingNaylaPcSnapshots();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      ok: true,
      leases,
      saves,
      snapshots,
      baseBuild,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo ejecutar la limpieza de Nayla PC.';
    return res.status(500).json({ error: message });
  }
}

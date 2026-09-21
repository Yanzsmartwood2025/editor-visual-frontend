import type { NextApiRequest, NextApiResponse } from 'next';
import { processPendingMemoryInteractions } from '../../../../lib/social/memory/service';
import { processDueAutomationJobs } from '../../../../lib/social/automation/worker';

const authorized = (req: NextApiRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa GET o POST.' });
  }

  if (!authorized(req)) {
    return res.status(process.env.CRON_SECRET ? 401 : 503).json({
      error: process.env.CRON_SECRET
        ? 'Cron no autorizado.'
        : 'Falta CRON_SECRET en el servidor.',
    });
  }

  try {
    const memory = await processPendingMemoryInteractions(20);
    const automation = await processDueAutomationJobs(20);

    return res.status(200).json({
      ok: true,
      memory,
      automation,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Falló el ciclo social.',
    });
  }
}

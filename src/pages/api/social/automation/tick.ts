import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { processPendingMemoryInteractions } from '../../../../lib/social/memory/service';
import { processDueAutomationJobs } from '../../../../lib/social/automation/worker';
import { getWorkspaceSupabaseAdmin } from '../../../../lib/workspaceStore';

const safeEqualHex = (a: string, b: string) => {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

const authorized = async (req: NextApiRequest) => {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  const schedulerToken = String(req.headers['x-nayla-scheduler-token'] || '');
  if (!schedulerToken) return false;

  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_scheduler_config')
    .select('secret_hash,enabled')
    .eq('singleton', true)
    .maybeSingle();

  if (error || !data?.enabled || !data.secret_hash) return false;

  const providedHash = createHash('sha256').update(schedulerToken).digest('hex');
  return safeEqualHex(providedHash, String(data.secret_hash));
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa GET o POST.' });
  }

  if (!(await authorized(req))) {
    return res.status(401).json({ error: 'Scheduler no autorizado.' });
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

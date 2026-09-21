import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { syncSocialAccounts } from '../../../lib/social/sync';
import { getSocialOverview } from '../../../lib/social/store';
import { socialProviderStatuses } from '../../../lib/social/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;
  const projectId = String(req.body?.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    const synced = await syncSocialAccounts(user.uid, projectId);
    const overview = await getSocialOverview(user.uid, projectId);
    return res.status(200).json({
      ...overview,
      providerErrors: synced.providerErrors,
      providers: socialProviderStatuses(),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron sincronizar las cuentas.' });
  }
}

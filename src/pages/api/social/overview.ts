import type { NextApiRequest, NextApiResponse } from 'next';
import { SOCIAL_NETWORKS, socialProviderStatuses } from '../../../lib/social/types';
import { requireSocialUser } from '../../../lib/social/http';
import { getSocialOverview } from '../../../lib/social/store';
import { syncSocialAccounts } from '../../../lib/social/sync';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    let providerErrors: Record<string, string> = {};
    if (req.query.refresh === '1') {
      const synced = await syncSocialAccounts(user.uid, projectId);
      providerErrors = synced.providerErrors;
    }
    const overview = await getSocialOverview(user.uid, projectId);
    return res.status(200).json({
      ...overview,
      providerErrors,
      providers: socialProviderStatuses(),
      networks: SOCIAL_NETWORKS,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo cargar REDES.',
    });
  }
}

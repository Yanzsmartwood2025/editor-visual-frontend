import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { MEDIA_CAPABILITY_CATALOG } from '../../../lib/mediaProviders/capabilities';
import { getAllProviderRuntimeStatuses } from '../../../lib/mediaProviders/registry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Usa GET.' });
  }

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  return res.status(200).json({
    providers: getAllProviderRuntimeStatuses(),
    capabilities: MEDIA_CAPABILITY_CATALOG,
  });
}

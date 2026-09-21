import type { NextApiRequest, NextApiResponse } from 'next';
import { socialProviderStatuses } from '../../../lib/social/serverStatus';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  const routes = socialProviderStatuses().filter((provider) => provider.configured).length;
  const webhookSecrets = [
    Boolean(process.env.UPLOAD_POST_WEBHOOK_SECRET?.trim()),
    Boolean(process.env.ZERNIO_WEBHOOK_SECRET?.trim()),
  ].filter(Boolean).length;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    ready: routes > 0,
    redundant: routes > 1,
    routes,
    realtime: {
      ready: webhookSecrets === 2,
      configured: webhookSecrets,
      required: 2,
    },
  });
}

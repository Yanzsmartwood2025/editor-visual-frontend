import type { NextApiRequest, NextApiResponse } from 'next';
import { SOCIAL_NETWORKS } from '../../../lib/social/types';
import { socialProviderStatuses } from '../../../lib/social/serverStatus';
import { requireSocialUser, requestOrigin } from '../../../lib/social/http';
import { reviewConnectedSocialActivity } from '../../../lib/social/activity/service';
import { ensureZernioWebhook } from '../../../lib/social/providers/zernio';
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
      providerErrors = { ...synced.providerErrors };

      try {
        const origin = requestOrigin(req);
        const webhook = await ensureZernioWebhook(`${origin}/api/social/webhooks/zernio`);
        if (!webhook.configured && webhook.reason === 'missing_secret') {
          providerErrors.zernio_webhook = 'La actualización en tiempo real necesita completar la configuración segura del webhook.';
        }
      } catch (error) {
        providerErrors.zernio_webhook = error instanceof Error ? error.message : 'No se pudo verificar la actualización en tiempo real.';
      }

      try {
        await reviewConnectedSocialActivity({
          userId: user.uid,
          projectId,
          message: 'Revisa toda la actividad de redes: comentarios, mensajes, likes, me gusta y métricas.',
        });
      } catch (error) {
        providerErrors.activity = error instanceof Error ? error.message : 'No se pudo actualizar toda la actividad social.';
      }
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

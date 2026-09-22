import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser, requestOrigin } from '../../../lib/social/http';
import { reviewConnectedSocialActivity } from '../../../lib/social/activity/service';
import { ensureZernioWebhook } from '../../../lib/social/providers/zernio';
import { syncSocialAccounts } from '../../../lib/social/sync';
import { getSocialOverview } from '../../../lib/social/store';
import { socialProviderStatuses } from '../../../lib/social/serverStatus';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;
  const projectId = String(req.body?.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    const synced = await syncSocialAccounts(user.uid, projectId);
    const providerErrors: Record<string, string> = { ...synced.providerErrors };

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

    const overview = await getSocialOverview(user.uid, projectId);
    return res.status(200).json({
      ...overview,
      providerErrors,
      providers: socialProviderStatuses(),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron sincronizar las cuentas.' });
  }
}

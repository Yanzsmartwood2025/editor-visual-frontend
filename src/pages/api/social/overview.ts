import type { NextApiRequest, NextApiResponse } from 'next';
import { SOCIAL_NETWORKS } from '../../../lib/social/types';
import { socialProviderStatuses } from '../../../lib/social/serverStatus';
import { requireSocialUser, requestOrigin } from '../../../lib/social/http';
import { reviewConnectedSocialActivity } from '../../../lib/social/activity/service';
import { ensureZernioWebhook } from '../../../lib/social/providers/zernio';
import { ensureUploadPostProfileWebhook } from '../../../lib/social/providers/uploadPost';
import { getSocialOverview } from '../../../lib/social/store';
import { syncSocialAccounts } from '../../../lib/social/sync';

const publicProviderError = (value: unknown) => {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();

  if (/limit of 2 profiles|profile_limit_reached|profile limit/.test(lower)) {
    return 'Nayla Social ya tiene ocupados los 2 perfiles incluidos en el plan actual. Las cuentas existentes pueden seguir usándose.';
  }
  if (/payment_required|payment required|free tier|plan limit/.test(lower)) {
    return 'Nayla Social alcanzó el límite gratuito disponible en una de sus rutas.';
  }
  if (/reauth|reconnect|required.*permission|token.*expired/.test(lower)) {
    return 'Una conexión social necesita volver a autorizarse.';
  }

  return raw
    .replace(/upload-post/gi, 'Ruta A')
    .replace(/zernio/gi, 'Ruta B')
    .slice(0, 320);
};

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
        const [routeAWebhook, routeBWebhook] = await Promise.all([
          ensureUploadPostProfileWebhook({
            username: synced.profile.upload_post_username,
            url: `${origin}/api/social/webhooks/upload-post`,
          }),
          ensureZernioWebhook(`${origin}/api/social/webhooks/zernio`),
        ]);
        if (!routeAWebhook.configured) {
          providerErrors.upload_post_webhook = 'La actualización automática de publicaciones necesita completar su conexión.';
        }
        if (!routeBWebhook.configured && routeBWebhook.reason === 'missing_secret') {
          providerErrors.zernio_webhook = 'La actualización en tiempo real necesita completar la configuración segura del webhook.';
        }
      } catch (error) {
        providerErrors.webhooks = error instanceof Error ? error.message : 'No se pudieron verificar las actualizaciones en tiempo real.';
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
    providerErrors = Object.fromEntries(
      Object.entries(providerErrors)
        .map(([key, value]) => [key, publicProviderError(value)])
        .filter(([, value]) => Boolean(value))
    );

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

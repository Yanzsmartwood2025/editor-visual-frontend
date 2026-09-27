import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createUploadPostConnectUrl } from '../../../lib/social/providers/uploadPost';
import { createZernioConnectUrl, createZernioTelegramCode } from '../../../lib/social/providers/zernio';
import { requireSocialUser, requestOrigin } from '../../../lib/social/http';
import { ensureSocialProfile } from '../../../lib/social/store';
import { ensureZernioProfileBinding, recoverUploadPostProfileBinding } from '../../../lib/social/sync';
import { SOCIAL_NETWORKS, getSocialNetwork } from '../../../lib/social/types';

const schema = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(['upload_post', 'zernio']),
  platform: z.string().min(1),
  profileUsername: z.string().min(1).max(200).optional(),
});

const publicConnectFailure = (error: any, platformLabel: string) => {
  const status = Number(error?.status) || 500;
  const payload = error?.payload && typeof error.payload === 'object' ? error.payload : {};
  const code = String(
    payload?.error_code ||
    payload?.code ||
    payload?.reason ||
    ''
  );
  const rawMessage = String(
    payload?.message ||
    payload?.error ||
    error?.message ||
    ''
  );

  if (status === 401) {
    return {
      status: 503,
      code: 'social_route_auth',
      error: `La conexión interna de Nayla Social necesita renovar su credencial antes de conectar ${platformLabel}.`,
    };
  }

  if (
    status === 402 ||
    ['PAYMENT_REQUIRED', 'payment_required', 'free_tier_exceeded'].includes(code)
  ) {
    return {
      status: 402,
      code: 'social_free_limit',
      error: `Nayla Social alcanzó el límite gratuito disponible en esta ruta para conectar ${platformLabel}.`,
    };
  }

  if (
    status === 403 &&
    /PROFILE_LIMIT_REACHED|PROFILE_BLOCKED|limit|over.?limit/i.test(code + ' ' + rawMessage)
  ) {
    return {
      status: 409,
      code: 'social_profile_limit',
      error: 'Nayla Social ya tiene ocupados los espacios gratuitos de perfiles en esta ruta. Voy a intentar reutilizar los perfiles existentes.',
    };
  }

  if (
    status === 409 &&
    /ACCOUNT_ALREADY_LINKED|already.?linked|already.?connected/i.test(code + ' ' + rawMessage)
  ) {
    return {
      status: 409,
      code: 'social_account_already_linked',
      error: `Esta cuenta de ${platformLabel} ya está conectada a otro espacio social.`,
    };
  }

  if (status === 429) {
    return {
      status: 429,
      code: 'social_rate_limit',
      error: 'Nayla Social recibió demasiadas solicitudes de conexión. Inténtalo nuevamente en unos minutos.',
    };
  }

  return {
    status: status >= 400 && status < 500 ? status : 500,
    code: code || 'social_connect_failed',
    error: rawMessage
      ? `No se pudo iniciar ${platformLabel}: ${rawMessage.slice(0, 220)}`
      : `No se pudo iniciar la conexión de ${platformLabel}.`,
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Solicitud inválida.' });
  const platform = parsed.data.platform as any;
  if (!SOCIAL_NETWORKS.some((network) => network.id === platform)) {
    return res.status(400).json({ error: 'Red social no soportada.' });
  }

  try {
    let profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
    const origin = requestOrigin(req);
    const redirectUrl = `${origin}/?social_callback=1&provider=${encodeURIComponent(parsed.data.provider)}&projectId=${encodeURIComponent(parsed.data.projectId)}`;

    if (parsed.data.provider === 'upload_post') {
      if (!process.env.UPLOAD_POST_API_KEY) {
        return res.status(503).json({ error: 'Esta ruta de Nayla Social todavía no tiene credencial configurada.' });
      }

      if (parsed.data.profileUsername) {
        const recovered = await recoverUploadPostProfileBinding({
          profile,
          userId: user.uid,
          projectId: parsed.data.projectId,
          preferredUsername: parsed.data.profileUsername,
        });
        profile = recovered.profile;
      }

      try {
        const authUrl = await createUploadPostConnectUrl({
          username: profile.upload_post_username,
          platform,
          redirectUrl,
        });
        return res.status(200).json({ authUrl });
      } catch (error: any) {
        const status = Number(error?.status);
        const code = String(error?.payload?.error_code || error?.payload?.code || '');

        if (
          status === 403 &&
          /PROFILE_LIMIT_REACHED|PROFILE_BLOCKED/i.test(code)
        ) {
          const recovered = await recoverUploadPostProfileBinding({
            profile,
            userId: user.uid,
            projectId: parsed.data.projectId,
          });

          if (recovered.recovered) {
            const authUrl = await createUploadPostConnectUrl({
              username: recovered.profile.upload_post_username,
              platform,
              redirectUrl,
            });
            return res.status(200).json({
              authUrl,
              recoveredProfile: true,
            });
          }

          if (recovered.requiresChoice) {
            return res.status(409).json({
              error: 'Encontré más de un perfil social anterior. Elige cuál pertenece a este espacio de Nayla.',
              code: 'social_profile_recovery_required',
              profiles: recovered.candidates.map((candidate) => ({
                username: candidate.username,
                createdAt: candidate.createdAt,
                matchScore: candidate.matchScore,
                connected: candidate.connected,
              })),
            });
          }

          return res.status(409).json({
            error: 'Los perfiles disponibles de esta ruta ya están ocupados por otros espacios de Nayla.',
            code: 'social_profile_limit',
          });
        }

        throw error;
      }
    }

    if (!process.env.ZERNIO_API_KEY) return res.status(503).json({ error: 'Esta ruta de Nayla Social todavía no tiene credencial configurada.' });
    profile = await ensureZernioProfileBinding({
      profile,
      userId: user.uid,
      projectId: parsed.data.projectId,
    });
    const network = getSocialNetwork(platform);
    if (network?.zernioConnectMode === 'telegram_code') {
      const details = await createZernioTelegramCode(profile.zernio_profile_id);
      return res.status(200).json({
        connectionMode: 'instructions',
        details,
      });
    }
    if (network?.zernioConnectMode === 'credentials') {
      return res.status(409).json({ error: `${network.label} requiere credenciales específicas; Nayla mostrará ese formulario en una siguiente conexión manual.` });
    }
    if (network?.zernioConnectMode === 'oauth_channel') {
      return res.status(409).json({ error: `${network.label} requiere elegir el canal después de OAuth; Nayla no abrirá un flujo incompleto.` });
    }
    const authUrl = await createZernioConnectUrl({
      profileId: profile.zernio_profile_id,
      platform,
      redirectUrl,
    });
    return res.status(200).json({ connectionMode: 'oauth', authUrl });
  } catch (error: any) {
    const network = getSocialNetwork(platform);
    const publicFailure = publicConnectFailure(error, network?.label || String(platform));

    console.error('[social-connect]', {
      provider: parsed.data.provider,
      platform,
      status: Number(error?.status) || 500,
      code: String(error?.payload?.error_code || error?.payload?.code || error?.payload?.reason || ''),
      message: String(error?.payload?.message || error?.payload?.error || error?.message || '').slice(0, 500),
    });

    return res.status(publicFailure.status).json({
      error: publicFailure.error,
      code: publicFailure.code,
    });
  }
}

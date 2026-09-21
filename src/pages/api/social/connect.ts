import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createUploadPostConnectUrl, ensureUploadPostProfile } from '../../../lib/social/providers/uploadPost';
import { createZernioConnectUrl, createZernioProfile, createZernioTelegramCode } from '../../../lib/social/providers/zernio';
import { requireSocialUser, requestOrigin } from '../../../lib/social/http';
import { ensureSocialProfile, updateSocialProviderProfileId } from '../../../lib/social/store';
import { SOCIAL_NETWORKS, getSocialNetwork } from '../../../lib/social/types';

const schema = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(['upload_post', 'zernio']),
  platform: z.string().min(1),
});

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
      if (!process.env.UPLOAD_POST_API_KEY) return res.status(503).json({ error: 'Ruta A está lista en código, pero falta UPLOAD_POST_API_KEY.' });
      await ensureUploadPostProfile(profile.upload_post_username);
      const authUrl = await createUploadPostConnectUrl({
        username: profile.upload_post_username,
        platform,
        redirectUrl,
      });
      return res.status(200).json({ authUrl });
    }

    if (!process.env.ZERNIO_API_KEY) return res.status(503).json({ error: 'Ruta B está lista en código, pero falta ZERNIO_API_KEY.' });
    if (!profile.zernio_profile_id) {
      const remote = await createZernioProfile(`Nayla · ${String(profile.id).slice(0, 8)}`);
      profile = await updateSocialProviderProfileId({
        profileId: profile.id,
        provider: 'zernio',
        providerProfileId: String(remote._id),
      });
    }
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
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo iniciar la conexión social.' });
  }
}

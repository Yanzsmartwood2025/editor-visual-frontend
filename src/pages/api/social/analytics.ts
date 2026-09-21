import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, getSocialAccountForUser } from '../../../lib/social/store';
import { getUploadPostAnalytics } from '../../../lib/social/providers/uploadPost';
import { getZernioAnalytics } from '../../../lib/social/providers/zernio';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.query.projectId || '');
  const accountId = String(req.query.accountId || '');
  if (!projectId || !accountId) return res.status(400).json({ error: 'Faltan projectId y accountId.' });

  try {
    const profile = await ensureSocialProfile(user.uid, projectId);
    const account = await getSocialAccountForUser({ userId: user.uid, projectId, accountId });
    const analytics = account.provider === 'upload_post'
      ? await getUploadPostAnalytics(profile.upload_post_username, [account.platform])
      : await getZernioAnalytics({
          profileId: profile.zernio_profile_id,
          accountId: account.provider_account_id,
          platform: account.platform,
        });
    return res.status(200).json({ analytics });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron leer las métricas.' });
  }
}

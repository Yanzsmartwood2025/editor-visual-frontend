import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, getSocialAccountForUser } from '../../../lib/social/store';
import { listUploadPostMedia } from '../../../lib/social/providers/uploadPost';

const normalizeMedia = (item: any) => ({
  id: String(item?.id || item?.media_id || item?.post_id || ''),
  caption: String(item?.caption || item?.description || item?.title || ''),
  mediaType: String(item?.media_type || item?.type || ''),
  permalink: item?.permalink || item?.url || item?.post_url || null,
  thumbnailUrl: item?.thumbnail_url || item?.thumbnail || item?.cover_url || null,
  timestamp: item?.timestamp || item?.created_at || item?.created_time || null,
  raw: item,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.query.projectId || '');
  const accountId = String(req.query.accountId || '');
  if (!projectId || !accountId) return res.status(400).json({ error: 'Faltan projectId y accountId.' });

  try {
    const account = await getSocialAccountForUser({ userId: user.uid, projectId, accountId });

    if (account.provider !== 'upload_post') {
      return res.status(200).json({
        media: [],
        notice: 'La lectura de publicaciones recientes para esta conexión se habilitará cuando la red la exponga.',
      });
    }

    const profile = await ensureSocialProfile(user.uid, projectId);
    const payload = await listUploadPostMedia({
      username: profile.upload_post_username,
      platform: account.platform,
      limit: 30,
    });
    const source = Array.isArray(payload?.media) ? payload.media : Array.isArray(payload?.data) ? payload.data : [];
    const media = source.map(normalizeMedia).filter((item: any) => item.id);

    return res.status(200).json({
      media,
      pagination: payload?.pagination || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron leer las publicaciones recientes.',
    });
  }
}

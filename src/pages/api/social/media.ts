import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, getSocialAccountForUser } from '../../../lib/social/store';
import { listUploadPostMedia } from '../../../lib/social/providers/uploadPost';
import { syncZernioExternalPosts } from '../../../lib/social/providers/zernio';

const normalizeMedia = (item: any) => ({
  id: String(
    item?.platformPostId ||
    item?.platform_post_id ||
    item?.id ||
    item?.media_id ||
    item?.post_id ||
    ''
  ),
  caption: String(item?.caption || item?.description || item?.title || item?.content || ''),
  mediaType: String(item?.mediaType || item?.media_type || item?.type || ''),
  permalink: item?.platformPostUrl || item?.permalink || item?.url || item?.post_url || null,
  thumbnailUrl: item?.thumbnailUrl || item?.thumbnail_url || item?.thumbnail || item?.cover_url || null,
  timestamp: item?.publishedAt || item?.timestamp || item?.created_at || item?.created_time || null,
  analytics: item?.analytics || null,
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

    if (account.provider === 'upload_post') {
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
    }

    const payload = await syncZernioExternalPosts(String(account.provider_account_id));
    const source =
      Array.isArray(payload?.posts) ? payload.posts :
      Array.isArray(payload?.synced?.posts) ? payload.synced.posts :
      Array.isArray(payload?.data?.posts) ? payload.data.posts :
      [];
    const media = source.map(normalizeMedia).filter((item: any) => item.id);

    return res.status(200).json({
      media,
      pagination: payload?.pagination || null,
      notice: media.length ? null : 'La red no devolvió publicaciones recientes todavía.',
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron leer las publicaciones recientes.',
    });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { publishSocialVideo } from '../../../lib/social/publishing/service';

const schema = z.object({
  projectId: z.string().uuid(),
  mediaId: z.string().uuid(),
  accountIds: z.array(z.string().uuid()).min(1).max(30),
  title: z.string().trim().max(300).default(''),
  caption: z.string().trim().max(10000).default(''),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Publicación inválida.',
    });
  }

  try {
    const result = await publishSocialVideo({
      userId: user.uid,
      projectId: parsed.data.projectId,
      mediaId: parsed.data.mediaId,
      accountIds: parsed.data.accountIds,
      title: parsed.data.title,
      caption: parsed.data.caption,
      source: 'social_ui',
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo publicar.',
    });
  }
}

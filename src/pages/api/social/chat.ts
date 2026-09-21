import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { getSocialChat, replyInSocialChat } from '../../../lib/social/chat/service';

const schema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(1).max(8000),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const projectId = String(req.query.projectId || '');
      if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });
      const chat = await getSocialChat({ userId: user.uid, projectId });
      return res.status(200).json(chat);
    }

    if (req.method === 'POST') {
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Mensaje inválido.' });
      }

      const result = await replyInSocialChat({
        userId: user.uid,
        projectId: parsed.data.projectId,
        message: parsed.data.message,
      });

      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Nayla no pudo abrir el chat social.',
    });
  }
}

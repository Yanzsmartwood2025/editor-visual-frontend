import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { getSocialAccountForUser, recordSocialUsage } from '../../../lib/social/store';
import { listZernioConversations, listZernioMessages, sendZernioMessage } from '../../../lib/social/providers/zernio';

const sendSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(5000),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const projectId = String(req.query.projectId || '');
      const accountId = String(req.query.accountId || '');
      const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
      if (!projectId || !accountId) return res.status(400).json({ error: 'Faltan projectId y accountId.' });
      const account = await getSocialAccountForUser({ userId: user.uid, projectId, accountId });
      if (account.provider !== 'zernio') {
        return res.status(200).json({
          conversations: [],
          messages: [],
          notice: 'El Inbox conversacional completo usa Ruta B; comentarios públicos siguen disponibles por ambas rutas.',
        });
      }
      if (conversationId) {
        const payload = await listZernioMessages(conversationId);
        return res.status(200).json({ messages: payload?.messages || payload?.data || [], raw: payload });
      }
      const payload = await listZernioConversations(String(account.provider_account_id));
      return res.status(200).json({ conversations: payload?.conversations || payload?.data || [], raw: payload });
    }

    if (req.method === 'POST') {
      const parsed = sendSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Mensaje inválido.' });
      const account = await getSocialAccountForUser({
        userId: user.uid,
        projectId: parsed.data.projectId,
        accountId: parsed.data.accountId,
      });
      if (account.provider !== 'zernio') return res.status(409).json({ error: 'Esta cuenta no tiene Inbox bidireccional por la ruta actual.' });
      const result = await sendZernioMessage(parsed.data.conversationId, parsed.data.message);
      await recordSocialUsage({
        userId: user.uid,
        projectId: parsed.data.projectId,
        action: 'direct_message',
        provider: 'zernio',
        platform: account.platform,
        metadata: { conversationId: parsed.data.conversationId },
      });
      return res.status(200).json({ success: true, result });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo abrir el Inbox.' });
  }
}

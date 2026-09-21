import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, getSocialAccountForUser, recordSocialUsage } from '../../../lib/social/store';
import { listUploadPostConversations, sendUploadPostDm } from '../../../lib/social/providers/uploadPost';
import { listZernioConversations, listZernioMessages, sendZernioMessage } from '../../../lib/social/providers/zernio';
import { cancelPendingAutomation } from '../../../lib/social/automation/service';

const sendSchema = z.object({
  projectId: z.string().uuid(),
  accountId: z.string().uuid(),
  conversationId: z.string().min(1).optional(),
  recipientId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(5000),
}).refine((value) => Boolean(value.conversationId || value.recipientId), {
  message: 'Falta conversationId o recipientId.',
});

const normalizeUploadPostConversation = (conversation: any, account: any) => {
  const messages = Array.isArray(conversation?.messages?.data) ? conversation.messages.data : [];
  const participants = Array.isArray(conversation?.participants?.data) ? conversation.participants.data : [];
  const selfIds = new Set(
    [
      account?.raw?.id,
      account?.raw?.user_id,
      account?.raw?.account_id,
      account?.raw?.ig_user_id,
    ].filter(Boolean).map(String)
  );
  const participant =
    participants.find((item: any) => item?.id && !selfIds.has(String(item.id))) ||
    participants[0] ||
    null;
  const last = messages[messages.length - 1] || null;
  return {
    id: String(conversation?.id || ''),
    platform: account.platform,
    participantId: participant?.id ? String(participant.id) : null,
    participantName: participant?.username || participant?.name || 'Conversación',
    lastMessage: last?.message || '',
    updatedTime: last?.created_time || null,
    messages,
    raw: conversation,
  };
};

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

      if (account.provider === 'upload_post') {
        if (account.platform !== 'instagram') {
          return res.status(200).json({
            conversations: [],
            messages: [],
            notice: 'Los mensajes privados no están disponibles para esta cuenta. Los comentarios públicos sí puedes gestionarlos arriba.',
          });
        }
        const profile = await ensureSocialProfile(user.uid, projectId);
        const payload = await listUploadPostConversations({
          username: profile.upload_post_username,
          platform: account.platform,
        });
        const conversations = (Array.isArray(payload?.conversations) ? payload.conversations : [])
          .map((item: any) => normalizeUploadPostConversation(item, account))
          .filter((item: any) => item.id);
        if (conversationId) {
          const conversation = conversations.find((item: any) => item.id === conversationId);
          return res.status(200).json({
            conversations,
            messages: conversation?.messages || [],
            conversation: conversation || null,
            raw: payload,
          });
        }
        return res.status(200).json({ conversations, messages: [], raw: payload });
      }

      const remoteAccountId = String(account.provider_account_id);
      if (conversationId) {
        const payload = await listZernioMessages(conversationId, remoteAccountId);
        return res.status(200).json({ messages: payload?.messages || payload?.data || [], raw: payload });
      }

      const payload = await listZernioConversations(remoteAccountId);
      return res.status(200).json({
        conversations: payload?.conversations || payload?.data || [],
        messages: [],
        raw: payload,
      });
    }

    if (req.method === 'POST') {
      const parsed = sendSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Mensaje inválido.' });

      const account = await getSocialAccountForUser({
        userId: user.uid,
        projectId: parsed.data.projectId,
        accountId: parsed.data.accountId,
      });

      let result: any;
      if (account.provider === 'upload_post') {
        if (account.platform !== 'instagram') {
          return res.status(409).json({ error: 'Los mensajes privados no están disponibles para esta cuenta.' });
        }
        if (!parsed.data.recipientId) return res.status(400).json({ error: 'Falta recipientId.' });
        const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
        result = await sendUploadPostDm({
          username: profile.upload_post_username,
          platform: account.platform,
          recipientId: parsed.data.recipientId,
          message: parsed.data.message,
        });
      } else {
        if (!parsed.data.conversationId) return res.status(400).json({ error: 'Falta conversationId.' });
        result = await sendZernioMessage(
          parsed.data.conversationId,
          String(account.provider_account_id),
          parsed.data.message
        );
      }

      if (parsed.data.conversationId) {
        await cancelPendingAutomation({
          accountId: account.id,
          channel: 'dm',
          conversationId: parsed.data.conversationId,
          reason: 'El usuario respondió manualmente esta conversación.',
        });
      }

      await recordSocialUsage({
        userId: user.uid,
        projectId: parsed.data.projectId,
        action: 'direct_message',
        provider: account.provider,
        platform: account.platform,
        metadata: {
          conversationId: parsed.data.conversationId || null,
          recipientId: parsed.data.recipientId || null,
        },
      });

      return res.status(200).json({ success: true, result });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo abrir el Inbox.' });
  }
}

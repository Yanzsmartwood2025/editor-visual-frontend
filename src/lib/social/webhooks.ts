import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest } from 'next';
import { getWorkspaceSupabaseAdmin } from '../workspaceStore';
import { recordSocialInteraction } from './interactions/service';

export const readRawBody = async (req: NextApiRequest) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const safeEqualHex = (a: string, b: string) => {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

export const verifyUploadPostWebhook = ({
  rawBody,
  timestamp,
  signature,
}: {
  rawBody: Buffer;
  timestamp: string;
  signature: string;
}) => {
  const secret = process.env.UPLOAD_POST_WEBHOOK_SECRET;
  if (!secret) throw new Error('UPLOAD_POST_WEBHOOK_SECRET no está configurado.');
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(Date.now() / 1000 - numericTimestamp) > 300) return false;
  const provided = signature.replace(/^sha256=/i, '');
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest('hex');
  return safeEqualHex(provided, expected);
};

export const verifyZernioWebhook = ({
  rawBody,
  signature,
}: {
  rawBody: Buffer;
  signature: string;
}) => {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) throw new Error('ZERNIO_WEBHOOK_SECRET no está configurado.');
  const provided = signature.replace(/^sha256=/i, '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(provided, expected);
};

export const storeWebhookEvent = async ({
  provider,
  eventId,
  eventType,
  payload,
}: {
  provider: 'upload_post' | 'zernio';
  eventId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const row = {
    provider,
    provider_event_id: eventId || null,
    event_type: eventType || 'unknown',
    payload,
    processed: false,
  };
  const query = eventId
    ? supabase.from('social_webhook_events').upsert(row, {
        onConflict: 'provider,provider_event_id',
        ignoreDuplicates: true,
      })
    : supabase.from('social_webhook_events').insert(row);
  const { error } = await query;
  if (error) throw error;
};

export const bestEffortCacheZernioRealtime = async (payload: any) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const accountRemoteId = String(
    payload?.account?.accountId ||
    payload?.account?.id ||
    payload?.account?._id ||
    payload?.accountId ||
    ''
  );
  if (!accountRemoteId) return;

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('provider', 'zernio')
    .eq('provider_account_id', accountRemoteId)
    .maybeSingle();

  if (!account) return;

  const event = String(payload?.event || payload?.type || '');

  if ((event === 'post.external.created' || event === 'post.external.updated') && payload?.post?.analytics) {
    const analytics = payload.post.analytics || {};
    const metricMap: Record<string, number> = {};
    const pairs: Array<[string, unknown]> = [
      ['Me gusta', analytics.likes],
      ['Comentarios', analytics.comments],
      ['Compartidos', analytics.shares],
      ['Guardados', analytics.saves],
      ['Vistas', analytics.views],
      ['Alcance', analytics.reach],
      ['Impresiones', analytics.impressions],
    ];

    for (const [label, raw] of pairs) {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) metricMap[label] = numeric;
    }

    if (Object.keys(metricMap).length) {
      await supabase.from('social_metrics_snapshots').insert({
        user_id: account.user_id,
        project_id: account.project_id,
        account_id: account.id,
        provider: 'zernio',
        platform: account.platform,
        metrics: metricMap,
        captured_at: new Date().toISOString(),
      });
    }
  }

  if (event === 'comment.received' || payload?.comment) {
    const comment = payload.comment || payload.data?.comment || payload.data || {};
    const commentId = String(comment.id || comment._id || comment.commentId || '');
    if (!commentId) return;

    const authorId = String(comment.author?.id || comment.user?.id || '') || null;
    const authorName = comment.author?.name || comment.user?.name || comment.username || null;
    const authorUsername = comment.author?.username || comment.user?.username || comment.username || null;
    const message = String(comment.message || comment.text || comment.content || '');
    const postId = String(comment.postId || payload?.post?.id || payload?.postId || '') || null;
    const createdAt = comment.createdAt || payload?.timestamp || new Date().toISOString();

    const normalized = await recordSocialInteraction({
      userId: account.user_id,
      projectId: account.project_id,
      account,
      channel: 'comment',
      direction: 'inbound',
      sourceId: commentId,
      body: message,
      providerUserId: authorId,
      username: authorUsername,
      displayName: authorName,
      avatarUrl: comment.author?.avatarUrl || comment.user?.avatarUrl || null,
      providerPostId: postId,
      providerParentId: comment.parentId || null,
      occurredAt: createdAt,
      raw: comment,
    });

    await supabase.from('social_comments').upsert({
      user_id: account.user_id,
      project_id: account.project_id,
      account_id: account.id,
      provider: 'zernio',
      platform: account.platform,
      provider_post_id: postId,
      provider_comment_id: commentId,
      parent_comment_id: comment.parentId || null,
      author_id: authorId,
      author_name: authorName,
      author_avatar_url: comment.author?.avatarUrl || comment.user?.avatarUrl || null,
      message,
      person_id: normalized.person.id,
      interaction_id: normalized.interaction.id,
      created_at: createdAt,
      received_at: new Date().toISOString(),
      raw: comment,
    }, { onConflict: 'provider,provider_comment_id' });
  }

  if (event.startsWith('message.') || payload?.message) {
    const conversation = payload.conversation || {};
    const conversationRemoteId = String(conversation.id || conversation._id || payload?.conversationId || '');
    const message = payload.message || {};
    const messageRemoteId = String(message.id || message._id || message.platformMessageId || '');
    if (!conversationRemoteId || !messageRemoteId) return;

    const direction = event === 'message.received' ? 'inbound' : 'outbound';
    const participant = conversation.participant || {};
    const externalId = String(participant.id || participant._id || message.sender?.id || '') || null;
    const externalName = participant.name || participant.username || message.sender?.name || null;
    const externalUsername = participant.username || message.sender?.username || null;
    const messageText = String(message.text || message.message || '');
    const createdAt = message.createdAt || payload?.timestamp || new Date().toISOString();

    const normalized = await recordSocialInteraction({
      userId: account.user_id,
      projectId: account.project_id,
      account,
      channel: 'dm',
      direction,
      sourceId: messageRemoteId,
      body: messageText,
      providerUserId: externalId,
      username: externalUsername,
      displayName: externalName,
      avatarUrl: participant.avatarUrl || message.sender?.avatarUrl || null,
      providerConversationId: conversationRemoteId,
      providerParentId: externalId,
      occurredAt: createdAt,
      raw: message,
    });

    const { data: localConversation } = await supabase.from('social_conversations').upsert({
      user_id: account.user_id,
      project_id: account.project_id,
      account_id: account.id,
      provider: 'zernio',
      platform: account.platform,
      provider_conversation_id: conversationRemoteId,
      participant_id: externalId,
      participant_name: externalName,
      participant_avatar_url: participant.avatarUrl || null,
      person_id: normalized.person.id,
      last_message: messageText,
      last_message_at: createdAt,
      unread_count: direction === 'inbound' ? 1 : 0,
      raw: conversation,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_conversation_id' }).select('*').single();

    if (localConversation) {
      await supabase.from('social_messages').upsert({
        conversation_id: localConversation.id,
        user_id: account.user_id,
        project_id: account.project_id,
        provider_message_id: messageRemoteId,
        direction,
        author_name: direction === 'inbound' ? externalName : account.display_name,
        message: messageText,
        media_url: message.attachments?.[0]?.url || null,
        person_id: normalized.person.id,
        interaction_id: normalized.interaction.id,
        raw: message,
        created_at: createdAt,
      }, { onConflict: 'conversation_id,provider_message_id' });
    }
  }
};

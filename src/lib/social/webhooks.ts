import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest } from 'next';
import { getWorkspaceSupabaseAdmin } from '../workspaceStore';

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
  const accountRemoteId = String(payload?.account?.id || payload?.account?._id || payload?.accountId || '');
  if (!accountRemoteId) return;
  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('provider', 'zernio')
    .eq('provider_account_id', accountRemoteId)
    .maybeSingle();
  if (!account) return;

  const event = String(payload?.event || payload?.type || '');
  if (event === 'comment.received' || payload?.comment) {
    const comment = payload.comment || payload.data?.comment || payload.data || {};
    const commentId = String(comment.id || comment._id || comment.commentId || '');
    if (!commentId) return;
    await supabase.from('social_comments').upsert({
      user_id: account.user_id,
      project_id: account.project_id,
      account_id: account.id,
      provider: 'zernio',
      platform: account.platform,
      provider_post_id: String(comment.postId || payload?.post?.id || payload?.postId || '') || null,
      provider_comment_id: commentId,
      parent_comment_id: comment.parentId || null,
      author_id: String(comment.author?.id || comment.user?.id || '') || null,
      author_name: comment.author?.name || comment.user?.name || comment.username || null,
      author_avatar_url: comment.author?.avatarUrl || null,
      message: String(comment.message || comment.text || comment.content || ''),
      created_at: comment.createdAt || payload?.timestamp || null,
      received_at: new Date().toISOString(),
      raw: comment,
    }, { onConflict: 'provider,provider_comment_id' });
  }

  if (event.startsWith('message.') || payload?.message) {
    const conversation = payload.conversation || {};
    const conversationRemoteId = String(conversation.id || conversation._id || payload?.conversationId || '');
    const message = payload.message || {};
    if (!conversationRemoteId) return;
    const { data: localConversation } = await supabase.from('social_conversations').upsert({
      user_id: account.user_id,
      project_id: account.project_id,
      account_id: account.id,
      provider: 'zernio',
      platform: account.platform,
      provider_conversation_id: conversationRemoteId,
      participant_id: String(conversation.participant?.id || message.sender?.id || '') || null,
      participant_name: conversation.participant?.name || message.sender?.name || null,
      participant_avatar_url: conversation.participant?.avatarUrl || null,
      last_message: String(message.text || message.message || ''),
      last_message_at: message.createdAt || payload?.timestamp || new Date().toISOString(),
      unread_count: event === 'message.received' ? 1 : 0,
      raw: conversation,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_conversation_id' }).select('*').single();
    const messageRemoteId = String(message.id || message._id || message.platformMessageId || '');
    if (localConversation && messageRemoteId) {
      await supabase.from('social_messages').upsert({
        conversation_id: localConversation.id,
        user_id: account.user_id,
        project_id: account.project_id,
        provider_message_id: messageRemoteId,
        direction: event === 'message.received' ? 'inbound' : 'outbound',
        author_name: message.sender?.name || null,
        message: String(message.text || message.message || ''),
        media_url: message.attachments?.[0]?.url || null,
        raw: message,
        created_at: message.createdAt || payload?.timestamp || new Date().toISOString(),
      }, { onConflict: 'conversation_id,provider_message_id' });
    }
  }
};

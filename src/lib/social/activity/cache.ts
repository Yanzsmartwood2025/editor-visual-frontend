import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { recordSocialInteraction } from '../interactions/service';

export const extractSocialComments = (payload: any): any[] => {
  const candidates = [
    payload?.comments,
    payload?.data?.comments,
    payload?.data,
    payload?.items,
  ];
  return candidates.find(Array.isArray) || [];
};

export const cacheSocialComments = async ({
  userId,
  projectId,
  provider,
  platform,
  account,
  postId,
  targetId,
  payload,
}: {
  userId: string;
  projectId: string;
  provider: string;
  platform: string;
  account: any;
  postId?: string | null;
  targetId?: string | null;
  payload: any;
}) => {
  const comments = extractSocialComments(payload);
  if (!comments.length) return comments;

  const supabase = getWorkspaceSupabaseAdmin();
  const rows: any[] = [];

  for (const comment of comments) {
    const commentId = String(comment.id || comment.comment_id || comment.commentId || '');
    if (!commentId) continue;

    const authorId = String(
      comment.from?.id ||
      comment.author?.id ||
      comment.user_id ||
      comment.user?.id ||
      ''
    );
    const authorName =
      comment.from?.name ||
      comment.author?.name ||
      comment.username ||
      comment.user?.display_name ||
      comment.user?.username ||
      null;
    const authorUsername =
      comment.author?.username ||
      comment.user?.username ||
      comment.username ||
      null;
    const authorAvatar =
      comment.author?.avatar ||
      comment.author?.avatar_url ||
      comment.user?.avatar_url ||
      comment.user?.avatar ||
      null;
    const message = String(comment.message || comment.text || comment.content || '');
    const createdAt =
      comment.created_at ||
      comment.createdAt ||
      comment.timestamp ||
      comment.created_time ||
      null;
    const parentId = comment.parent_id || comment.parentId || comment.parentCommentId || null;

    const normalized = await recordSocialInteraction({
      userId,
      projectId,
      account,
      channel: 'comment',
      direction: 'inbound',
      sourceId: commentId,
      body: message,
      providerUserId: authorId || null,
      username: authorUsername,
      displayName: authorName,
      avatarUrl: authorAvatar,
      providerPostId: postId || null,
      providerParentId: parentId,
      occurredAt: createdAt,
      raw: comment,
    });

    rows.push({
      user_id: userId,
      project_id: projectId,
      account_id: account.id,
      post_target_id: targetId || null,
      provider,
      platform,
      provider_post_id: postId || null,
      provider_comment_id: commentId,
      parent_comment_id: parentId,
      author_id: authorId || null,
      author_name: authorName,
      author_avatar_url: authorAvatar,
      message,
      person_id: normalized.person.id,
      interaction_id: normalized.interaction.id,
      created_at: createdAt,
      received_at: new Date().toISOString(),
      raw: comment,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from('social_comments').upsert(rows, {
      onConflict: 'provider,provider_comment_id',
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  return comments;
};

const asArray = (value: any): any[] => Array.isArray(value) ? value : [];

const messageId = (message: any) =>
  String(message?.id || message?._id || message?.message_id || message?.messageId || message?.platformMessageId || '');

const messageText = (message: any) =>
  String(message?.message || message?.text || message?.content || message?.body || '');

const messageCreatedAt = (message: any) =>
  message?.created_at ||
  message?.createdAt ||
  message?.created_time ||
  message?.timestamp ||
  new Date().toISOString();

const senderId = (message: any) =>
  String(
    message?.sender?.id ||
    message?.sender?._id ||
    message?.from?.id ||
    message?.author?.id ||
    message?.user?.id ||
    message?.user_id ||
    ''
  );

export const cacheSocialConversation = async ({
  userId,
  projectId,
  account,
  conversation,
  messages,
}: {
  userId: string;
  projectId: string;
  account: any;
  conversation: any;
  messages?: any[];
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const providerConversationId = String(
    conversation?.id ||
    conversation?._id ||
    conversation?.conversation_id ||
    conversation?.conversationId ||
    ''
  );
  if (!providerConversationId) return { conversations: 0, messages: 0, inbound: 0 };

  const participants = [
    ...asArray(conversation?.participants?.data),
    ...asArray(conversation?.participants),
  ];
  const selfIds = new Set(
    [
      account?.provider_account_id,
      account?.raw?.id,
      account?.raw?.user_id,
      account?.raw?.account_id,
      account?.raw?.ig_user_id,
    ].filter(Boolean).map(String)
  );

  const participant =
    conversation?.participant ||
    participants.find((item: any) => {
      const id = String(item?.id || item?._id || '');
      return id && !selfIds.has(id);
    }) ||
    participants[0] ||
    {};

  const participantId = String(
    participant?.id ||
    participant?._id ||
    conversation?.participantId ||
    conversation?.recipientId ||
    ''
  ) || null;
  const participantName =
    participant?.name ||
    participant?.displayName ||
    participant?.username ||
    conversation?.participantName ||
    conversation?.username ||
    'Conversación';
  const participantUsername =
    participant?.username ||
    conversation?.username ||
    null;
  const participantAvatar =
    participant?.avatarUrl ||
    participant?.avatar_url ||
    participant?.avatar ||
    conversation?.participantAvatarUrl ||
    null;

  const sourceMessages =
    messages ||
    asArray(conversation?.messages?.data).length
      ? (messages || asArray(conversation?.messages?.data))
      : asArray(conversation?.messages);

  let localPersonId: string | null = null;
  let lastText = String(conversation?.lastMessage?.text || conversation?.lastMessage || conversation?.preview || '');
  let lastAt = conversation?.updatedTime || conversation?.updatedAt || conversation?.lastMessageAt || null;
  let inboundCount = 0;
  const normalizedMessages: Array<{ interaction: any; raw: any; direction: 'inbound' | 'outbound' }> = [];

  for (const rawMessage of sourceMessages) {
    const sourceId = messageId(rawMessage);
    if (!sourceId) continue;

    const rawDirection = String(rawMessage?.direction || '').toLowerCase();
    const fromId = senderId(rawMessage);
    const outbound =
      rawDirection === 'outbound' ||
      rawMessage?.isFromMe === true ||
      rawMessage?.fromMe === true ||
      (fromId ? selfIds.has(fromId) : false);
    const direction: 'inbound' | 'outbound' = outbound ? 'outbound' : 'inbound';
    const body = messageText(rawMessage);
    const occurredAt = messageCreatedAt(rawMessage);

    const normalized = await recordSocialInteraction({
      userId,
      projectId,
      account,
      channel: 'dm',
      direction,
      sourceId,
      body,
      providerUserId: participantId,
      username: participantUsername,
      displayName: participantName,
      avatarUrl: participantAvatar,
      providerConversationId,
      providerParentId: participantId,
      occurredAt,
      raw: rawMessage,
    });

    localPersonId = normalized.person.id || localPersonId;
    if (direction === 'inbound') inboundCount += 1;
    if (body) lastText = body;
    lastAt = occurredAt || lastAt;
    normalizedMessages.push({ interaction: normalized.interaction, raw: rawMessage, direction });
  }

  if (!localPersonId && participantId) {
    const placeholderId = `conversation:${providerConversationId}`;
    const normalized = await recordSocialInteraction({
      userId,
      projectId,
      account,
      channel: 'dm',
      direction: 'inbound',
      sourceId: placeholderId,
      body: lastText || 'Conversación',
      providerUserId: participantId,
      username: participantUsername,
      displayName: participantName,
      avatarUrl: participantAvatar,
      providerConversationId,
      providerParentId: participantId,
      occurredAt: lastAt || new Date().toISOString(),
      raw: { conversationOnly: true },
    });
    localPersonId = normalized.person.id;
  }

  const { data: localConversation, error: conversationError } = await supabase
    .from('social_conversations')
    .upsert({
      user_id: userId,
      project_id: projectId,
      account_id: account.id,
      provider: account.provider,
      platform: account.platform,
      provider_conversation_id: providerConversationId,
      participant_id: participantId,
      participant_name: participantName,
      participant_avatar_url: participantAvatar,
      person_id: localPersonId,
      last_message: lastText,
      last_message_at: lastAt || new Date().toISOString(),
      unread_count: inboundCount,
      raw: conversation,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_conversation_id' })
    .select('*')
    .single();

  if (conversationError) throw conversationError;

  for (const item of normalizedMessages) {
    const id = messageId(item.raw);
    if (!id) continue;
    const { error } = await supabase.from('social_messages').upsert({
      conversation_id: localConversation.id,
      user_id: userId,
      project_id: projectId,
      provider_message_id: id,
      direction: item.direction,
      author_name: item.direction === 'inbound' ? participantName : account.display_name,
      message: messageText(item.raw),
      media_url:
        item.raw?.attachments?.[0]?.url ||
        item.raw?.media?.[0]?.url ||
        item.raw?.media_url ||
        null,
      person_id: item.interaction.person_id,
      interaction_id: item.interaction.id,
      raw: item.raw,
      created_at: messageCreatedAt(item.raw),
    }, { onConflict: 'conversation_id,provider_message_id' });
    if (error) throw error;
  }

  return {
    conversations: 1,
    messages: normalizedMessages.length,
    inbound: inboundCount,
  };
};

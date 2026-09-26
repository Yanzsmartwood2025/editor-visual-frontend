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

const normalizeWebhookPlatform = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'twitter') return 'x';
  if (raw === 'googlebusiness') return 'google_business';
  return raw;
};

export const bestEffortCacheUploadPostRealtime = async (payload: any) => {
  const event = String(payload?.event || payload?.type || '');
  if (!event) return;

  const supabase = getWorkspaceSupabaseAdmin();
  const profileUsername = String(
    payload?.profile_username ||
    payload?.profileUsername ||
    payload?.user ||
    ''
  );
  if (!profileUsername) return;

  const { data: profile, error: profileError } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('upload_post_username', profileUsername)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return;

  const platform = normalizeWebhookPlatform(payload?.platform);
  const { data: account, error: accountError } = platform
    ? await supabase
        .from('social_accounts')
        .select('*')
        .eq('user_id', profile.user_id)
        .eq('project_id', profile.project_id)
        .eq('provider', 'upload_post')
        .eq('platform', platform)
        .maybeSingle()
    : { data: null, error: null };
  if (accountError) throw accountError;

  if (
    event === 'social_account_disconnected' ||
    event === 'social_account_reauth_required'
  ) {
    if (account) {
      await supabase
        .from('social_accounts')
        .update({
          status: event === 'social_account_reauth_required' ? 'reauth' : 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);
    }
    return;
  }

  if (event === 'social_account_connected') {
    if (account) {
      await supabase
        .from('social_accounts')
        .update({
          status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);
    }
    return;
  }

  if (event !== 'upload_completed' || !account) return;

  const result = payload?.result || {};
  const requestCandidates = [
    payload?.request_id,
    payload?.requestId,
    payload?.job_id,
    payload?.jobId,
    payload?.external_id,
    payload?.externalId,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  let targetQuery = supabase
    .from('social_post_targets')
    .select('id,social_post_id,status,provider_request_id,provider_post_id,post_url,updated_at')
    .eq('user_id', profile.user_id)
    .eq('project_id', profile.project_id)
    .eq('provider', 'upload_post')
    .eq('account_id', account.id);

  if (requestCandidates.length) {
    targetQuery = targetQuery.in('provider_request_id', requestCandidates);
  } else {
    const recentSince = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
    targetQuery = targetQuery
      .in('status', ['publishing', 'scheduled'])
      .gte('updated_at', recentSince);
  }

  const { data: target, error: targetError } = await targetQuery
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) return;

  const success = result?.success === true;
  const publishedAt = String(
    payload?.created_at ||
    payload?.createdAt ||
    result?.published_at ||
    new Date().toISOString()
  );
  const providerPostId = String(
    result?.post_id ||
    result?.publish_id ||
    result?.video_id ||
    ''
  ) || null;
  const postUrl = String(result?.url || result?.post_url || '') || null;
  const errorMessage = String(
    result?.error ||
    payload?.error ||
    payload?.message ||
    ''
  ) || null;

  await supabase
    .from('social_post_targets')
    .update(success ? {
      status: 'published',
      provider_post_id: providerPostId,
      post_url: postUrl,
      published_at: publishedAt,
      error_message: null,
      updated_at: new Date().toISOString(),
    } : {
      status: 'failed',
      ...(providerPostId ? { provider_post_id: providerPostId } : {}),
      ...(postUrl ? { post_url: postUrl } : {}),
      error_message: errorMessage || 'La red rechazó la publicación.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  const { data: socialPost, error: socialPostError } = await supabase
    .from('social_posts')
    .select('id,metadata')
    .eq('id', target.social_post_id)
    .maybeSingle();
  if (socialPostError) throw socialPostError;

  const programId = socialPost?.metadata?.programId
    ? String(socialPost.metadata.programId)
    : '';
  if (success && programId) {
    const language = String(
      socialPost?.metadata?.variantLanguages?.[account.platform] || 'es'
    );
    await supabase
      .from('social_publication_packages')
      .update({
        status: 'published',
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
        metadata: {
          socialPostId: socialPost.id,
          targetId: target.id,
          providerPostId,
          postUrl,
          confirmedBy: 'webhook',
        },
      })
      .eq('user_id', profile.user_id)
      .eq('project_id', profile.project_id)
      .eq('program_id', programId)
      .eq('platform', account.platform)
      .eq('language', language);
  }

  const { data: allTargets, error: allTargetsError } = await supabase
    .from('social_post_targets')
    .select('status')
    .eq('social_post_id', target.social_post_id);
  if (allTargetsError) throw allTargetsError;

  const statuses = (allTargets || []).map((item: any) => String(item.status || ''));
  const terminal = statuses.length > 0 && statuses.every((status: string) =>
    ['published', 'failed', 'skipped'].includes(status)
  );
  if (terminal) {
    const publishedCount = statuses.filter((status: string) => status === 'published').length;
    const failedCount = statuses.filter((status: string) => ['failed', 'skipped'].includes(status)).length;
    const postStatus = publishedCount && failedCount
      ? 'partial'
      : publishedCount
        ? 'published'
        : 'failed';

    await supabase
      .from('social_posts')
      .update({
        status: postStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.social_post_id);
  }
};

const zernioTargetAccountId = (value: any) =>
  String(
    value?.accountId?._id ||
    value?.accountId?.id ||
    value?.accountId ||
    ''
  );

const zernioPlatformTarget = (payload: any) => {
  if (payload?.platform && typeof payload.platform === 'object') return payload.platform;
  const targets = Array.isArray(payload?.post?.platforms) ? payload.post.platforms : [];
  if (!targets.length) return null;

  const topLevelAccountId = String(
    payload?.account?.accountId ||
    payload?.account?.id ||
    payload?.account?._id ||
    payload?.accountId ||
    ''
  );
  const rawPlatform = String(payload?.platformName || payload?.platform?.platform || '');
  return targets.find((target: any) =>
    (topLevelAccountId && zernioTargetAccountId(target) === topLevelAccountId) ||
    (rawPlatform && String(target?.platform || '') === rawPlatform)
  ) || targets[0] || null;
};

const cacheZernioPlatformLifecycle = async ({
  payload,
  account,
}: {
  payload: any;
  account: any;
}) => {
  const event = String(payload?.event || payload?.type || '');
  if (!['post.platform.published', 'post.platform.failed', 'post.tiktok.url_resolved'].includes(event)) {
    return false;
  }

  const supabase = getWorkspaceSupabaseAdmin();
  const platformTarget = zernioPlatformTarget(payload) || {};
  const providerRequestId = String(
    payload?.post?._id ||
    payload?.post?.id ||
    payload?.postId ||
    ''
  );
  const providerPostId = String(
    platformTarget?.platformPostId ||
    platformTarget?.platform_post_id ||
    payload?.platformPostId ||
    ''
  ) || null;
  const postUrl = String(
    platformTarget?.platformPostUrl ||
    platformTarget?.platform_post_url ||
    payload?.platformPostUrl ||
    ''
  ) || null;
  const publishedAt = String(
    platformTarget?.publishedAt ||
    payload?.post?.publishedAt ||
    payload?.timestamp ||
    new Date().toISOString()
  );
  const failureMessage = String(
    platformTarget?.platformError?.message ||
    platformTarget?.error?.message ||
    platformTarget?.error ||
    payload?.error?.message ||
    payload?.error ||
    ''
  ) || null;

  let query = supabase
    .from('social_post_targets')
    .select('id,social_post_id,status,provider_request_id,provider_post_id,post_url')
    .eq('user_id', account.user_id)
    .eq('project_id', account.project_id)
    .eq('account_id', account.id)
    .eq('provider', 'zernio');

  if (providerRequestId) {
    query = query.eq('provider_request_id', providerRequestId);
  } else if (providerPostId) {
    query = query.eq('provider_post_id', providerPostId);
  } else {
    return true;
  }

  const { data: target, error: targetError } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) return true;

  if (event === 'post.tiktok.url_resolved') {
    if (postUrl) {
      await supabase
        .from('social_post_targets')
        .update({
          post_url: postUrl,
          ...(providerPostId ? { provider_post_id: providerPostId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id);
    }
    return true;
  }

  const success = event === 'post.platform.published';
  const statusPatch = success
    ? {
        status: 'published',
        provider_post_id: providerPostId,
        post_url: postUrl,
        published_at: publishedAt,
        error_message: null,
        updated_at: new Date().toISOString(),
      }
    : {
        status: 'failed',
        ...(providerPostId ? { provider_post_id: providerPostId } : {}),
        ...(postUrl ? { post_url: postUrl } : {}),
        error_message: failureMessage || 'La red rechazó la publicación.',
        updated_at: new Date().toISOString(),
      };

  await supabase
    .from('social_post_targets')
    .update(statusPatch)
    .eq('id', target.id);

  const { data: socialPost, error: socialPostError } = await supabase
    .from('social_posts')
    .select('id,metadata')
    .eq('id', target.social_post_id)
    .maybeSingle();
  if (socialPostError) throw socialPostError;

  const programId = socialPost?.metadata?.programId
    ? String(socialPost.metadata.programId)
    : '';
  if (programId) {
    const language = String(
      socialPost?.metadata?.variantLanguages?.[account.platform] || 'es'
    );

    if (success) {
      await supabase
        .from('social_publication_packages')
        .update({
          status: 'published',
          published_at: publishedAt,
          updated_at: new Date().toISOString(),
          metadata: {
            socialPostId: socialPost.id,
            targetId: target.id,
            providerPostId,
            postUrl,
            confirmedBy: 'webhook',
          },
        })
        .eq('user_id', account.user_id)
        .eq('project_id', account.project_id)
        .eq('program_id', programId)
        .eq('platform', account.platform)
        .eq('language', language);
    }
  }

  const { data: allTargets, error: allTargetsError } = await supabase
    .from('social_post_targets')
    .select('status')
    .eq('social_post_id', target.social_post_id);
  if (allTargetsError) throw allTargetsError;

  const statuses = (allTargets || []).map((item: any) => String(item.status || ''));
  const terminal = statuses.every((status: string) =>
    ['published', 'failed', 'skipped'].includes(status)
  );
  if (terminal && statuses.length) {
    const publishedCount = statuses.filter((status: string) => status === 'published').length;
    const failedCount = statuses.filter((status: string) => ['failed', 'skipped'].includes(status)).length;
    const postStatus = publishedCount && failedCount
      ? 'partial'
      : publishedCount
        ? 'published'
        : 'failed';

    await supabase
      .from('social_posts')
      .update({
        status: postStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.social_post_id);
  }

  return true;
};

export const bestEffortCacheZernioRealtime = async (payload: any) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const lifecycleTarget = zernioPlatformTarget(payload);
  const accountRemoteId = String(
    payload?.account?.accountId ||
    payload?.account?.id ||
    payload?.account?._id ||
    payload?.accountId ||
    zernioTargetAccountId(lifecycleTarget) ||
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

  if (await cacheZernioPlatformLifecycle({ payload, account })) {
    return;
  }

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

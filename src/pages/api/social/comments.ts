import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';
import { ensureSocialProfile, getSocialAccountForUser, recordSocialUsage } from '../../../lib/social/store';
import { getUploadPostComments, replyUploadPostComment } from '../../../lib/social/providers/uploadPost';
import { getZernioComments, replyZernioComment } from '../../../lib/social/providers/zernio';
import { recordSocialInteraction } from '../../../lib/social/interactions/service';

const replySchema = z.object({
  projectId: z.string().uuid(),
  targetId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  postId: z.string().min(1).optional(),
  postUrl: z.string().url().optional(),
  commentId: z.string().min(1),
  message: z.string().trim().min(1).max(5000),
}).refine((value) => Boolean(value.targetId || (value.accountId && value.postId)), {
  message: 'Falta la publicación a responder.',
});

const extractComments = (payload: any) => {
  const candidates = [
    payload?.comments,
    payload?.data?.comments,
    payload?.data,
    payload?.items,
  ];
  return candidates.find(Array.isArray) || [];
};

const cacheComments = async ({
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
  const comments = extractComments(payload);
  if (!comments.length) return comments;

  const supabase = getWorkspaceSupabaseAdmin();
  const rows: any[] = [];

  for (const comment of comments) {
    const commentId = String(comment.id || comment.comment_id || comment.commentId || '');
    if (!commentId) continue;

    const authorId = String(comment.from?.id || comment.author?.id || comment.user_id || comment.user?.id || '');
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
    const createdAt = comment.created_at || comment.timestamp || comment.created_time || null;

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
      providerParentId: comment.parent_id || comment.parentCommentId || null,
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
      parent_comment_id: comment.parent_id || comment.parentCommentId || null,
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

const loadTarget = async (userId: string, projectId: string, targetId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: target, error } = await supabase
    .from('social_post_targets')
    .select('*')
    .eq('id', targetId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!target) throw new Error('No encontré esa publicación.');

  const account = target.account_id
    ? await getSocialAccountForUser({ userId, projectId, accountId: target.account_id })
    : null;
  if (!account) throw new Error('La publicación ya no tiene una cuenta conectada.');

  return {
    account,
    provider: String(target.provider),
    platform: String(target.platform),
    postId: target.provider_post_id ? String(target.provider_post_id) : null,
    postUrl: target.post_url ? String(target.post_url) : null,
    targetId: String(target.id),
  };
};

const loadDirect = async ({
  userId,
  projectId,
  accountId,
  postId,
  postUrl,
}: {
  userId: string;
  projectId: string;
  accountId: string;
  postId: string;
  postUrl?: string | null;
}) => {
  const account = await getSocialAccountForUser({ userId, projectId, accountId });
  return {
    account,
    provider: String(account.provider),
    platform: String(account.platform),
    postId,
    postUrl: postUrl || null,
    targetId: null,
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const projectId = String(req.query.projectId || '');
      const targetId = String(req.query.targetId || '');
      const accountId = String(req.query.accountId || '');
      const postId = String(req.query.postId || '');
      const postUrl = typeof req.query.postUrl === 'string' ? req.query.postUrl : null;

      if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

      const source = targetId
        ? await loadTarget(user.uid, projectId, targetId)
        : accountId && postId
          ? await loadDirect({ userId: user.uid, projectId, accountId, postId, postUrl })
          : null;

      if (!source) return res.status(400).json({ error: 'Selecciona una publicación.' });
      if (!source.postId && !source.postUrl) {
        return res.status(409).json({ error: 'La plataforma todavía no devolvió el identificador de esa publicación.' });
      }

      const profile = await ensureSocialProfile(user.uid, projectId);
      const payload = source.provider === 'upload_post'
        ? await getUploadPostComments({
            username: profile.upload_post_username,
            platform: source.platform as any,
            postId: source.postId,
            postUrl: source.postUrl,
          })
        : await getZernioComments({
            accountId: String(source.account.provider_account_id),
            postId: String(source.postId),
          });

      const comments = await cacheComments({
        userId: user.uid,
        projectId,
        provider: source.provider,
        platform: source.platform,
        account: source.account,
        postId: source.postId,
        targetId: source.targetId,
        payload,
      });

      return res.status(200).json({ comments });
    }

    if (req.method === 'POST') {
      const parsed = replySchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Respuesta inválida.' });
      }

      const source = parsed.data.targetId
        ? await loadTarget(user.uid, parsed.data.projectId, parsed.data.targetId)
        : await loadDirect({
            userId: user.uid,
            projectId: parsed.data.projectId,
            accountId: String(parsed.data.accountId),
            postId: String(parsed.data.postId),
            postUrl: parsed.data.postUrl || null,
          });

      if (!source.postId) return res.status(409).json({ error: 'Falta el identificador del post.' });

      const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
      const payload = source.provider === 'upload_post'
        ? await replyUploadPostComment({
            username: profile.upload_post_username,
            platform: source.platform as any,
            postId: source.postId,
            commentId: parsed.data.commentId,
            message: parsed.data.message,
          })
        : await replyZernioComment({
            accountId: String(source.account.provider_account_id),
            postId: source.postId,
            commentId: parsed.data.commentId,
            message: parsed.data.message,
          });

      await recordSocialUsage({
        userId: user.uid,
        projectId: parsed.data.projectId,
        action: 'comment_reply',
        provider: source.provider,
        platform: source.platform,
        metadata: {
          targetId: source.targetId,
          accountId: source.account.id,
          postId: source.postId,
          commentId: parsed.data.commentId,
        },
      });

      return res.status(200).json({ success: true, result: payload });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo gestionar comentarios.',
    });
  }
}

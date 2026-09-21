import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';
import { ensureSocialProfile, getSocialAccountForUser, recordSocialUsage } from '../../../lib/social/store';
import { getUploadPostComments, replyUploadPostComment } from '../../../lib/social/providers/uploadPost';
import { getZernioComments, replyZernioComment } from '../../../lib/social/providers/zernio';

const replySchema = z.object({
  projectId: z.string().uuid(),
  targetId: z.string().uuid(),
  commentId: z.string().min(1),
  message: z.string().trim().min(1).max(5000),
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
  target,
  account,
  payload,
}: any) => {
  const comments = extractComments(payload);
  if (!comments.length) return comments;
  const supabase = getWorkspaceSupabaseAdmin();
  const rows = comments.map((comment: any) => ({
    user_id: userId,
    project_id: projectId,
    account_id: account.id,
    post_target_id: target.id,
    provider: target.provider,
    platform: target.platform,
    provider_post_id: target.provider_post_id,
    provider_comment_id: String(comment.id || comment.comment_id || comment.commentId || ''),
    parent_comment_id: comment.parent_id || comment.parentCommentId || null,
    author_id: String(comment.from?.id || comment.author?.id || comment.user_id || ''),
    author_name: comment.from?.name || comment.author?.name || comment.username || comment.user?.display_name || null,
    author_avatar_url: comment.author?.avatar || comment.user?.avatar_url || null,
    message: String(comment.message || comment.text || comment.content || ''),
    created_at: comment.created_at || comment.timestamp || null,
    received_at: new Date().toISOString(),
    raw: comment,
  })).filter((row: any) => row.provider_comment_id);
  if (rows.length) {
    await supabase.from('social_comments').upsert(rows, {
      onConflict: 'provider,provider_comment_id',
      ignoreDuplicates: false,
    });
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
  return { target, account };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const projectId = String(req.query.projectId || '');
      const targetId = String(req.query.targetId || '');
      if (!projectId || !targetId) return res.status(400).json({ error: 'Faltan projectId y targetId.' });
      const { target, account } = await loadTarget(user.uid, projectId, targetId);
      if (!target.provider_post_id && !target.post_url) {
        return res.status(409).json({ error: 'La plataforma todavía no devolvió el identificador público del post.' });
      }
      const profile = await ensureSocialProfile(user.uid, projectId);
      const payload = target.provider === 'upload_post'
        ? await getUploadPostComments({
            username: profile.upload_post_username,
            platform: target.platform,
            postId: target.provider_post_id,
            postUrl: target.post_url,
          })
        : await getZernioComments({
            accountId: String(account.provider_account_id),
            postId: String(target.provider_post_id),
          });
      const comments = await cacheComments({ userId: user.uid, projectId, target, account, payload });
      return res.status(200).json({ comments, raw: payload });
    }

    if (req.method === 'POST') {
      const parsed = replySchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Respuesta inválida.' });
      const { target, account } = await loadTarget(user.uid, parsed.data.projectId, parsed.data.targetId);
      if (!target.provider_post_id) return res.status(409).json({ error: 'Falta el identificador del post.' });
      const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
      const payload = target.provider === 'upload_post'
        ? await replyUploadPostComment({
            username: profile.upload_post_username,
            platform: target.platform,
            commentId: parsed.data.commentId,
            message: parsed.data.message,
          })
        : await replyZernioComment({
            accountId: String(account.provider_account_id),
            postId: String(target.provider_post_id),
            commentId: parsed.data.commentId,
            message: parsed.data.message,
          });
      await recordSocialUsage({
        userId: user.uid,
        projectId: parsed.data.projectId,
        action: 'comment_reply',
        provider: target.provider,
        platform: target.platform,
        metadata: { targetId: target.id, commentId: parsed.data.commentId },
      });
      return res.status(200).json({ success: true, result: payload });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo gestionar comentarios.' });
  }
}

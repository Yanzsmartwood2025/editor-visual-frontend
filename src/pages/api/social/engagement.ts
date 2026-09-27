import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';
import { recordSocialUsage } from '../../../lib/social/store';
import { likeZernioComment, unlikeZernioComment } from '../../../lib/social/providers/zernio';

const schema = z.object({
  projectId: z.string().uuid(),
  interactionId: z.string().uuid(),
  action: z.enum(['like', 'unlike']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Acción inválida.' });
  }

  try {
    const supabase = getWorkspaceSupabaseAdmin();
    const { data: interaction, error: interactionError } = await supabase
      .from('social_interactions')
      .select('*')
      .eq('id', parsed.data.interactionId)
      .eq('user_id', user.uid)
      .eq('project_id', parsed.data.projectId)
      .maybeSingle();

    if (interactionError) throw interactionError;
    if (!interaction) return res.status(404).json({ error: 'No encontré esa interacción.' });
    if (interaction.channel !== 'comment' || interaction.direction !== 'inbound') {
      return res.status(409).json({ error: 'Esta interacción no admite Me gusta.' });
    }
    if (!interaction.provider_post_id || !interaction.source_id) {
      return res.status(409).json({ error: 'Falta el identificador del comentario.' });
    }

    const raw = interaction.raw && typeof interaction.raw === 'object' ? interaction.raw : {};
    if (parsed.data.action === 'like' && raw?.canLike === false) {
      return res.status(409).json({ error: 'La red no permite dar Me gusta a este comentario.' });
    }

    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('id', interaction.account_id)
      .eq('user_id', user.uid)
      .eq('project_id', parsed.data.projectId)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account || account.status !== 'connected') {
      return res.status(409).json({ error: 'La cuenta social ya no está conectada.' });
    }
    if (account.provider !== 'zernio') {
      return res.status(409).json({ error: 'Me gusta todavía no está habilitado para esta ruta social.' });
    }

    const args = {
      accountId: String(account.provider_account_id),
      postId: String(interaction.provider_post_id),
      commentId: String(interaction.source_id),
    };

    const result = parsed.data.action === 'like'
      ? await likeZernioComment(args)
      : await unlikeZernioComment(args);

    const nextRaw = {
      ...raw,
      isLiked: parsed.data.action === 'like',
      ...(typeof raw?.likeCount === 'number'
        ? {
            likeCount: Math.max(
              0,
              Number(raw.likeCount) + (parsed.data.action === 'like' ? 1 : -1)
            ),
          }
        : {}),
    };

    await Promise.all([
      supabase
        .from('social_interactions')
        .update({ raw: nextRaw })
        .eq('id', interaction.id),
      supabase
        .from('social_comments')
        .update({ raw: nextRaw })
        .eq('user_id', user.uid)
        .eq('project_id', parsed.data.projectId)
        .eq('account_id', interaction.account_id)
        .eq('provider_comment_id', String(interaction.source_id)),
    ]);

    await recordSocialUsage({
      userId: user.uid,
      projectId: parsed.data.projectId,
      action: parsed.data.action === 'like' ? 'comment_like' : 'comment_unlike',
      provider: account.provider,
      platform: account.platform,
      metadata: {
        interactionId: interaction.id,
        postId: interaction.provider_post_id,
        commentId: interaction.source_id,
      },
    });

    return res.status(200).json({
      success: true,
      liked: parsed.data.action === 'like',
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo actualizar el Me gusta.',
    });
  }
}

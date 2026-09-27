import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';
import { reviewConnectedSocialActivity } from '../../../lib/social/activity/service';

const toInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
  const platform = typeof req.query.platform === 'string' ? req.query.platform : '';
  const limit = toInt(req.query.limit, 80, 1, 200);
  const offset = toInt(req.query.offset, 0, 0, 100000);
  const refresh = req.query.refresh === '1' || req.query.refresh === 'all';
  const exhaustiveRefresh = req.query.refresh === 'all';

  try {
    let refreshError: string | null = null;
    if (refresh) {
      try {
        await reviewConnectedSocialActivity({
          userId: user.uid,
          projectId,
          message: exhaustiveRefresh
            ? 'Tráeme todas las notificaciones: todos los comentarios y todos los mensajes de todas las redes.'
            : 'Revisa comentarios y mensajes de todas las redes.',
        });
      } catch (error) {
        refreshError = error instanceof Error ? error.message : 'No se pudo actualizar la actividad externa.';
      }
    }

    const supabase = getWorkspaceSupabaseAdmin();
    let query = supabase
      .from('social_interactions')
      .select('id,person_id,identity_id,account_id,provider,platform,channel,direction,source_id,provider_post_id,provider_conversation_id,provider_parent_id,body,occurred_at,response_state,responded_at,response_text,response_source,raw,social_people(display_name,preferred_name,relationship_stage),social_identities(username,display_name,avatar_url,profile_url),social_accounts(display_name,username,handle,status)', { count: 'exact' })
      .eq('user_id', user.uid)
      .eq('project_id', projectId)
      .eq('direction', 'inbound')
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === 'pending') {
      query = query.in('response_state', ['unanswered', 'planned']);
    } else if (filter === 'responded') {
      query = query.eq('response_state', 'responded');
    }

    if (platform) query = query.eq('platform', platform);

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data || []).map((item: any) => {
      const person = Array.isArray(item.social_people) ? item.social_people[0] : item.social_people;
      const identity = Array.isArray(item.social_identities) ? item.social_identities[0] : item.social_identities;
      const account = Array.isArray(item.social_accounts) ? item.social_accounts[0] : item.social_accounts;
      const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};

      return {
        id: item.id,
        personId: item.person_id,
        personName:
          person?.preferred_name ||
          person?.display_name ||
          identity?.display_name ||
          identity?.username ||
          'Persona',
        relationshipStage: person?.relationship_stage || null,
        username: identity?.username || null,
        avatarUrl: identity?.avatar_url || raw?.from?.picture || null,
        profileUrl: identity?.profile_url || null,
        accountId: item.account_id,
        accountName: account?.display_name || account?.handle || account?.username || item.platform,
        platform: item.platform,
        channel: item.channel,
        message: item.body || '',
        occurredAt: item.occurred_at,
        responseState: item.response_state || 'unanswered',
        respondedAt: item.responded_at || null,
        responseText: item.response_text || null,
        postId: item.provider_post_id || null,
        commentId: item.channel === 'comment' ? item.source_id : null,
        conversationId: item.provider_conversation_id || null,
        canReply: item.channel === 'comment' ? raw?.canReply !== false : true,
        canLike: item.channel === 'comment' ? raw?.canLike === true : false,
        isLiked: item.channel === 'comment' ? raw?.isLiked === true : false,
        likeCount: Number.isFinite(Number(raw?.likeCount)) ? Number(raw.likeCount) : null,
        raw,
      };
    });

    const summary = {
      total: count ?? items.length,
      pending: items.filter((item: any) => item.responseState !== 'responded').length,
      responded: items.filter((item: any) => item.responseState === 'responded').length,
      likeable: items.filter((item: any) => item.canLike).length,
    };

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      items,
      summary,
      refreshError,
      offset,
      limit,
      hasMore: offset + items.length < (count ?? items.length),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo abrir la bandeja global.',
    });
  }
}

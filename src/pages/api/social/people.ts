import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../lib/social/http';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.query.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    const supabase = getWorkspaceSupabaseAdmin();
    const { data: people, error } = await supabase
      .from('social_people')
      .select('id,display_name,preferred_name,summary,relationship_stage,interaction_count,first_seen_at,last_seen_at')
      .eq('user_id', user.uid)
      .eq('project_id', projectId)
      .order('last_seen_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return res.status(200).json({ people: people || [] });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron cargar las personas.',
    });
  }
}

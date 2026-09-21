import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../../lib/social/http';
import { ensureSocialProfile } from '../../../../lib/social/store';
import { ensureDefaultAutomationRule } from '../../../../lib/social/automation/service';
import { getWorkspaceSupabaseAdmin } from '../../../../lib/workspaceStore';

const schema = z.object({
  projectId: z.string().uuid(),
  enabled: z.boolean(),
  channel: z.enum(['comments','dms','both']).default('comments'),
  minDelayMinutes: z.number().int().min(0).max(43200),
  maxDelayMinutes: z.number().int().min(0).max(43200),
  dailyReplyLimit: z.number().int().min(1).max(500).default(20),
  personCooldownMinutes: z.number().int().min(0).max(43200).default(180),
  simpleOnly: z.boolean().default(true),
  instructions: z.string().trim().max(2000).default(''),
}).refine((value) => value.maxDelayMinutes >= value.minDelayMinutes, {
  message: 'El tiempo máximo debe ser mayor o igual al mínimo.',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    const projectId = req.method === 'GET'
      ? String(req.query.projectId || '')
      : String(req.body?.projectId || '');

    if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

    const profile = await ensureSocialProfile(user.uid, projectId);
    const current = await ensureDefaultAutomationRule({
      profileId: profile.id,
      userId: user.uid,
      projectId,
    });

    if (req.method === 'GET') {
      return res.status(200).json({ rule: current });
    }

    if (req.method === 'POST') {
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Regla inválida.' });
      }

      const supabase = getWorkspaceSupabaseAdmin();
      const { data, error } = await supabase
        .from('social_automation_rules')
        .update({
          enabled: parsed.data.enabled,
          channel: parsed.data.channel,
          min_delay_minutes: parsed.data.minDelayMinutes,
          max_delay_minutes: parsed.data.maxDelayMinutes,
          daily_reply_limit: parsed.data.dailyReplyLimit,
          person_cooldown_minutes: parsed.data.personCooldownMinutes,
          simple_only: parsed.data.simpleOnly,
          instructions: parsed.data.instructions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ rule: data });
    }

    return res.status(405).json({ error: 'Usa GET o POST.' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo guardar la automatización.',
    });
  }
}

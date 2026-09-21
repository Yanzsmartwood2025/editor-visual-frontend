import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, saveSocialPolicy } from '../../../lib/social/store';

const schema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['off', 'suggest', 'auto']),
  tone: z.string().trim().max(300).default('amable, cercano y profesional'),
  language: z.string().trim().max(30).default('auto'),
  instructions: z.string().trim().max(3000).default(''),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Política inválida.' });

  try {
    const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
    const policy = await saveSocialPolicy({
      userId: user.uid,
      projectId: parsed.data.projectId,
      profileId: profile.id,
      mode: parsed.data.mode,
      tone: parsed.data.tone,
      language: parsed.data.language,
      instructions: parsed.data.instructions,
    });
    return res.status(200).json({ policy });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la política.' });
  }
}

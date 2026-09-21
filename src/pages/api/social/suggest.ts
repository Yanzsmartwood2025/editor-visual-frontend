import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, recordSocialUsage } from '../../../lib/social/store';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';
import { generateSocialText } from '../../../lib/social/ai/generate';
import { getPersonMemoryContext } from '../../../lib/social/identity/service';

const schema = z.object({
  projectId: z.string().uuid(),
  platform: z.string().trim().min(1).max(40),
  accountId: z.string().uuid().optional(),
  commentId: z.string().min(1).optional(),
  authorName: z.string().trim().max(200).optional().default(''),
  commentText: z.string().trim().min(1).max(5000),
});

const cleanReply = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();

const memoryText = async ({
  userId,
  projectId,
  accountId,
  commentId,
}: {
  userId: string;
  projectId: string;
  accountId?: string;
  commentId?: string;
}) => {
  if (!accountId || !commentId) return '';

  const supabase = getWorkspaceSupabaseAdmin();
  const { data: comment, error } = await supabase
    .from('social_comments')
    .select('person_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('account_id', accountId)
    .eq('provider_comment_id', commentId)
    .maybeSingle();

  if (error || !comment?.person_id) return '';

  const context = await getPersonMemoryContext(comment.person_id);
  const lines: string[] = [];

  if (context.summary?.summary) {
    lines.push('Resumen de relación: ' + context.summary.summary);
  }

  for (const memory of context.memories || []) {
    lines.push(`- ${memory.memory_key ? memory.memory_key + ': ' : ''}${memory.memory_value}`);
  }

  return lines.slice(0, 20).join('\n');
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Solicitud inválida.',
    });
  }

  try {
    const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
    const supabase = getWorkspaceSupabaseAdmin();

    const [{ data: policy, error: policyError }, remembered] = await Promise.all([
      supabase
        .from('social_ai_policies')
        .select('*')
        .eq('social_profile_id', profile.id)
        .maybeSingle(),
      memoryText({
        userId: user.uid,
        projectId: parsed.data.projectId,
        accountId: parsed.data.accountId,
        commentId: parsed.data.commentId,
      }),
    ]);

    if (policyError) throw policyError;

    const systemPrompt = [
      'Eres Nayla, inteligencia social del usuario.',
      'Escribe UNA respuesta breve, natural y lista para publicar al comentario recibido.',
      'No expliques tu razonamiento y no uses comillas alrededor de la respuesta.',
      'No eres únicamente una vendedora: prioriza continuidad, comunidad y conversación humana.',
      'No inventes precios, promesas, disponibilidad ni datos que no estén confirmados.',
      'Usa recuerdos solo para dar continuidad. No menciones que guardas memoria ni expongas información privada.',
      'Si el comentario es una queja, tema sensible, amenaza, asunto legal, reembolso o requiere información privada, responde con prudencia y no improvises soluciones.',
      `Tono configurado: ${policy?.tone || 'amable, cercano y profesional'}.`,
      policy?.language && policy.language !== 'auto'
        ? `Idioma: ${policy.language}.`
        : 'Responde en el mismo idioma del comentario.',
      policy?.instructions ? `Reglas del usuario: ${policy.instructions}` : '',
    ].filter(Boolean).join('\n');

    const prompt = [
      `Red: ${parsed.data.platform}`,
      parsed.data.authorName ? `Autor: ${parsed.data.authorName}` : '',
      remembered ? `Contexto conocido de esta persona:\n${remembered}` : '',
      `Comentario: ${parsed.data.commentText}`,
    ].filter(Boolean).join('\n\n');

    const raw = await generateSocialText({ prompt, systemPrompt });
    const suggestion = cleanReply(raw);

    if (!suggestion) throw new Error('Nayla no generó una respuesta utilizable.');

    await recordSocialUsage({
      userId: user.uid,
      projectId: parsed.data.projectId,
      action: 'ai_reply_suggestion',
      provider: null,
      platform: parsed.data.platform,
      metadata: {
        socialProfileId: profile.id,
        accountId: parsed.data.accountId || null,
        commentId: parsed.data.commentId || null,
        usedMemory: Boolean(remembered),
      },
    });

    return res.status(200).json({ suggestion, usedMemory: Boolean(remembered) });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Nayla no pudo sugerir una respuesta.',
    });
  }
}

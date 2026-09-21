import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { GroqProvider, MistralProvider } from '../../../utils/llmProvider';
import { requireSocialUser } from '../../../lib/social/http';
import { ensureSocialProfile, recordSocialUsage } from '../../../lib/social/store';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';

const schema = z.object({
  projectId: z.string().uuid(),
  platform: z.string().trim().min(1).max(40),
  authorName: z.string().trim().max(200).optional().default(''),
  commentText: z.string().trim().min(1).max(5000),
});

const cleanReply = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Solicitud inválida.' });

  try {
    const profile = await ensureSocialProfile(user.uid, parsed.data.projectId);
    const supabase = getWorkspaceSupabaseAdmin();
    const { data: policy, error } = await supabase
      .from('social_ai_policies')
      .select('*')
      .eq('social_profile_id', profile.id)
      .maybeSingle();
    if (error) throw error;

    const groqKey = process.env.GROQ_API_KEY?.trim();
    const mistralKey = process.env.MISTRAL_API_KEY?.trim();
    if (!groqKey && !mistralKey) return res.status(503).json({ error: 'Nayla no tiene un LLM de servidor configurado.' });

    const systemPrompt = [
      'Eres Nayla, asistente de community management.',
      'Escribe UNA respuesta lista para publicar al comentario recibido.',
      'No expliques tu razonamiento. No uses comillas alrededor de la respuesta.',
      'Sé breve y natural. No inventes precios, promesas, disponibilidad ni datos que no estén en el comentario.',
      'Si el comentario es una queja, tema sensible, amenaza, asunto legal, solicitud de reembolso o información que requiere datos privados, responde de forma prudente y pide continuar por un canal privado; no improvises soluciones.',
      `Tono configurado: ${policy?.tone || 'amable, cercano y profesional'}.`,
      policy?.language && policy.language !== 'auto' ? `Idioma: ${policy.language}.` : 'Responde en el mismo idioma del comentario.',
      policy?.instructions ? `Reglas del usuario: ${policy.instructions}` : '',
    ].filter(Boolean).join('\n');

    const prompt = [
      `Red: ${parsed.data.platform}`,
      parsed.data.authorName ? `Autor: ${parsed.data.authorName}` : '',
      `Comentario: ${parsed.data.commentText}`,
    ].filter(Boolean).join('\n');

    const generateGroq = async () => {
      if (!groqKey) throw new Error('Groq no configurado.');
      return new GroqProvider(groqKey, 'dialog').generateText(prompt, [], systemPrompt);
    };
    const generateMistral = async () => {
      if (!mistralKey) throw new Error('Mistral no configurado.');
      return new MistralProvider(mistralKey, 'dialog').generateText(prompt, [], systemPrompt);
    };

    const raw = groqKey
      ? await generateGroq().catch(() => generateMistral())
      : await generateMistral();
    const suggestion = cleanReply(raw);
    if (!suggestion) throw new Error('Nayla no generó una respuesta utilizable.');

    await recordSocialUsage({
      userId: user.uid,
      projectId: parsed.data.projectId,
      action: 'ai_reply_suggestion',
      provider: null,
      platform: parsed.data.platform,
      metadata: { socialProfileId: profile.id },
    });

    return res.status(200).json({ suggestion });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Nayla no pudo sugerir una respuesta.' });
  }
}

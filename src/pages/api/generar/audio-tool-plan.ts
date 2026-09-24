import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createMediaJobPlan } from '../../../lib/mediaJobs';
import { createR2PresignedGetUrl } from '../../../lib/r2';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from '../../../lib/workspaceStore';

const schema = z.object({
  mode: z.enum([
    'tts',
    'sound_effects',
    'speech_to_text',
    'voice_change',
    'voice_isolation',
    'text_to_dialogue',
  ]),
  text: z.string().max(10000).optional(),
  prompt: z.string().max(3000).optional(),
  inputMediaId: z.string().uuid().nullable().optional(),
  voiceId: z.string().max(200).nullable().optional(),
  language: z.enum(['es', 'en']).optional().default('es'),
  projectId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

const needsInput = new Set(['speech_to_text', 'voice_change', 'voice_isolation']);
const needsText = new Set(['tts', 'text_to_dialogue']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Usa POST.' });
  }

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Solicitud de audio inválida.',
    });
  }

  const data = parsed.data;
  const cleanText = data.text?.trim() || '';
  const cleanPrompt = data.prompt?.trim() || '';

  if (needsText.has(data.mode) && !cleanText) {
    return res.status(400).json({ error: 'Esta herramienta necesita texto.' });
  }
  if (data.mode === 'sound_effects' && !cleanPrompt) {
    return res.status(400).json({ error: 'Describe el sonido que quieres generar.' });
  }
  if (needsInput.has(data.mode) && !data.inputMediaId) {
    return res.status(400).json({ error: 'Selecciona un audio de entrada.' });
  }

  try {
    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: data.projectId || undefined,
      threadId: data.threadId || undefined,
    });

    let inputUrl: string | undefined;
    if (data.inputMediaId) {
      const supabase = getWorkspaceSupabaseAdmin();
      let query = supabase
        .from('galeria_multimedia')
        .select('id,r2_key,url,tipo,project_id,thread_id')
        .eq('id', data.inputMediaId)
        .eq('user_id', user.uid)
        .eq('project_id', scope.projectId)
        .in('tipo', ['audio', 'video']);

      if (scope.threadId) query = query.eq('thread_id', scope.threadId);

      const { data: item, error } = await query.maybeSingle();
      if (error) throw error;
      if (!item) {
        return res.status(403).json({
          error: 'El archivo de entrada no pertenece a tu Bóveda actual.',
        });
      }

      inputUrl =
        typeof item.r2_key === 'string' && item.r2_key
          ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 1800 }).url
          : typeof item.url === 'string' && item.url.startsWith('https://')
            ? item.url
            : undefined;

      if (!inputUrl) {
        return res.status(400).json({ error: 'Ese archivo no tiene una fuente utilizable.' });
      }
    }

    const requiresAdvancedVoiceRoute =
      data.mode === 'voice_change' ||
      data.mode === 'voice_isolation' ||
      data.mode === 'text_to_dialogue' ||
      Boolean(data.voiceId);

    const action = {
      action: 'GENERATE_AUDIO' as const,
      mode: data.mode,
      ...(requiresAdvancedVoiceRoute ? { provider: 'elevenlabs' as const } : {}),
      ...(cleanText ? { text: cleanText } : {}),
      ...(cleanPrompt ? { prompt: cleanPrompt } : {}),
      ...(inputUrl ? { inputUrl } : {}),
      ...(data.voiceId ? { voiceId: data.voiceId } : {}),
      targetLanguage: data.language,
    };

    const plan = await createMediaJobPlan({
      userId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
      action,
      attachmentIds: data.inputMediaId ? [data.inputMediaId] : [],
    });

    if (!plan || plan.status === 'unconfigured' || !plan.id) {
      return res.status(200).json({
        ready: false,
        message: 'Esta herramienta de audio todavía no tiene una ruta activa en este entorno.',
      });
    }

    return res.status(200).json({
      ready: true,
      jobId: plan.id,
      status: plan.status,
      message: 'Trabajo preparado. Confirma para ejecutar la herramienta de audio.',
    });
  } catch (error) {
    console.error('[generar/audio-tool-plan] failed', error);
    const raw = error instanceof Error ? error.message : '';
    return res.status(500).json({
      error:
        /proyecto|sesión|usuario|Bóveda|archivo/i.test(raw)
          ? raw
          : 'Nayla no pudo preparar esta herramienta de audio.',
    });
  }
}

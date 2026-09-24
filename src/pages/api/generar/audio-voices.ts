import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createR2PresignedGetUrl } from '../../../lib/r2';
import { providerCanExecuteAction } from '../../../lib/mediaProviders/execution';
import { getAvailableProvidersForAction, type NaylaAction } from '../../../lib/naylaActions';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from '../../../lib/workspaceStore';

const cloneSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(''),
  sampleIds: z.array(z.string().uuid()).min(1).max(10),
  removeBackgroundNoise: z.boolean().optional().default(false),
  rightsConfirmed: z.literal(true),
  projectId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

const readJson = async (response: Response) => {
  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw: raw.slice(0, 1200) };
  }
  if (!response.ok) {
    const message =
      payload?.detail?.message ||
      payload?.detail ||
      payload?.message ||
      payload?.error ||
      payload?.raw ||
      `HTTP ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return payload;
};

const routeReady = (action: NaylaAction) =>
  getAvailableProvidersForAction(action).some((provider) =>
    providerCanExecuteAction(provider.id, action)
  );

const getToolAvailability = (hasAdvancedVoice: boolean) => ({
  tts: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'tts',
    text: 'availability-check',
    targetLanguage: 'es',
  }),
  clone: hasAdvancedVoice,
  voice_change: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'voice_change',
    provider: 'elevenlabs',
    inputUrl: 'https://example.com/audio.mp3',
  }),
  voice_isolation: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'voice_isolation',
    provider: 'elevenlabs',
    inputUrl: 'https://example.com/audio.mp3',
  }),
  speech_to_text: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'speech_to_text',
    inputUrl: 'https://example.com/audio.mp3',
  }),
  sound_effects: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'sound_effects',
    prompt: 'availability-check',
  }),
  dialogue: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'text_to_dialogue',
    provider: 'elevenlabs',
    text: 'availability-check',
  }),
});

const publicVoice = (voice: any) => ({
  id: String(voice?.voice_id || ''),
  name: String(voice?.name || 'Voz'),
  category: typeof voice?.category === 'string' ? voice.category : null,
  description: typeof voice?.description === 'string' ? voice.description : null,
  previewUrl: typeof voice?.preview_url === 'string' ? voice.preview_url : null,
  labels: voice?.labels && typeof voice.labels === 'object' ? voice.labels : {},
  isOwner: Boolean(voice?.is_owner),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const tools = getToolAvailability(Boolean(apiKey));

  if (req.method === 'GET') {
    if (!apiKey) {
      return res.status(200).json({
        configured: false,
        voices: [],
        tools,
        message: 'La biblioteca avanzada de voces todavía no está conectada en este entorno.',
      });
    }

    try {
      const params = new URLSearchParams({
        page_size: '100',
        include_total_count: 'true',
      });
      const payload = await readJson(
        await fetch(`https://api.elevenlabs.io/v2/voices?${params.toString()}`, {
          method: 'GET',
          headers: { 'xi-api-key': apiKey },
        })
      );

      const voices = Array.isArray(payload?.voices)
        ? payload.voices.map(publicVoice).filter((voice: any) => voice.id)
        : [];

      return res.status(200).json({
        configured: true,
        voices,
        tools,
        hasMore: Boolean(payload?.has_more),
        totalCount: Number(payload?.total_count) || voices.length,
      });
    } catch (error) {
      console.error('[generar/audio-voices] list failed', error);
      return res.status(502).json({
        error: 'Nayla no pudo leer la biblioteca de voces en este intento.',
      });
    }
  }

  if (req.method === 'POST') {
    if (!apiKey) {
      return res.status(503).json({
        error: 'La clonación de voz todavía no está conectada en este entorno.',
      });
    }

    const parsed = cloneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Datos de clonación inválidos.',
      });
    }

    try {
      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        projectId: parsed.data.projectId || undefined,
        threadId: parsed.data.threadId || undefined,
      });

      const supabase = getWorkspaceSupabaseAdmin();
      let query = supabase
        .from('galeria_multimedia')
        .select('id,r2_key,url,nombre,tipo,project_id,thread_id,metadata')
        .eq('user_id', user.uid)
        .eq('project_id', scope.projectId)
        .eq('tipo', 'audio')
        .in('id', parsed.data.sampleIds);

      if (scope.threadId) query = query.eq('thread_id', scope.threadId);

      const { data: rows, error } = await query;
      if (error) throw error;

      const ordered = parsed.data.sampleIds
        .map((id) => (rows || []).find((row: any) => row.id === id))
        .filter(Boolean);

      if (ordered.length !== parsed.data.sampleIds.length) {
        return res.status(403).json({
          error: 'Una o más muestras no pertenecen a tu Bóveda de audio actual.',
        });
      }

      const form = new FormData();
      let totalBytes = 0;

      for (let index = 0; index < ordered.length; index++) {
        const item: any = ordered[index];
        const sourceUrl =
          typeof item.r2_key === 'string' && item.r2_key
            ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 900 }).url
            : typeof item.url === 'string' && item.url.startsWith('https://')
              ? item.url
              : null;

        if (!sourceUrl) {
          throw new Error('Una muestra no tiene una fuente de audio válida.');
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`No se pudo leer una muestra de voz (HTTP ${response.status}).`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) throw new Error('Una muestra de voz está vacía.');
        totalBytes += bytes.byteLength;

        if (totalBytes > 30 * 1024 * 1024) {
          throw new Error('Las muestras seleccionadas superan el límite temporal de 30 MB.');
        }

        const contentType =
          response.headers.get('content-type')?.split(';')[0] ||
          item?.metadata?.mimeType ||
          'audio/mpeg';
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([buffer], { type: contentType });
        const fileName =
          typeof item.nombre === 'string' && item.nombre.trim()
            ? item.nombre
            : `muestra-${index + 1}.mp3`;
        form.append('files', blob, fileName);
      }

      form.append('name', parsed.data.name);
      if (parsed.data.description) {
        form.append('description', parsed.data.description);
      }
      form.append(
        'remove_background_noise',
        parsed.data.removeBackgroundNoise ? 'true' : 'false'
      );

      const payload = await readJson(
        await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          body: form,
        })
      );

      const voiceId = String(payload?.voice_id || '');
      if (!voiceId) throw new Error('El motor de voz no devolvió un identificador.');

      return res.status(201).json({
        configured: true,
        voice: {
          id: voiceId,
          name: parsed.data.name,
          category: 'cloned',
          description: parsed.data.description || null,
          previewUrl: null,
          labels: {},
          isOwner: true,
          requiresVerification: Boolean(payload?.requires_verification),
        },
        message: payload?.requires_verification
          ? 'La voz fue creada y requiere verificación del proveedor antes de usarla.'
          : 'Voz clonada y añadida a tu biblioteca.',
      });
    } catch (error) {
      console.error('[generar/audio-voices] clone failed', error);
      const raw = error instanceof Error ? error.message : '';
      return res.status(502).json({
        error:
          /muestra|límite|pertenecen|fuente/i.test(raw)
            ? raw
            : 'Nayla no pudo crear la voz clonada en este intento.',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Usa GET o POST.' });
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createR2PresignedGetUrl } from '../../../lib/r2';
import { providerCanExecuteAction } from '../../../lib/mediaProviders/execution';
import { getAvailableProvidersForAction, type NaylaAction } from '../../../lib/naylaActions';
import {
  createNaylaClonedVoice,
  listNaylaVoices,
  syncNaylaVoiceCatalog,
  type PrivateVoiceRoutes,
} from '../../../lib/naylaVoiceLibrary';
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
  language: z.string().trim().min(2).max(12).optional().default('es'),
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

const getToolAvailability = () => ({
  tts: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'tts',
    text: 'availability-check',
    targetLanguage: 'es',
  }),
  clone: Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.CARTESIA_API_KEY?.trim()
  ),
  voice_change: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'voice_change',
    inputUrl: 'https://example.com/audio.mp3',
  }),
  voice_isolation: routeReady({
    action: 'GENERATE_AUDIO',
    mode: 'voice_isolation',
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
    text: 'availability-check',
  }),
});

type Sample = {
  blob: Blob;
  fileName: string;
};

const cloneWithRouteA = async ({
  samples,
  name,
  description,
  removeBackgroundNoise,
}: {
  samples: Sample[];
  name: string;
  description: string;
  removeBackgroundNoise: boolean;
}) => {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return null;
  const form = new FormData();
  for (const sample of samples) {
    form.append('files', sample.blob, sample.fileName);
  }
  form.append('name', name);
  if (description) form.append('description', description);
  form.append('remove_background_noise', removeBackgroundNoise ? 'true' : 'false');
  const payload = await readJson(await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  }));
  const voiceId = String(payload?.voice_id || '').trim();
  if (!voiceId) throw new Error('clone-route-a-empty');
  return {
    voiceId,
    capabilities: ['tts','voice_change','dialogue'],
    requiresVerification: Boolean(payload?.requires_verification),
  };
};

const cloneWithRouteB = async ({
  sample,
  name,
  description,
  language,
}: {
  sample: Sample;
  name: string;
  description: string;
  language: string;
}) => {
  const key = process.env.CARTESIA_API_KEY?.trim();
  if (!key) return null;
  const form = new FormData();
  form.append('clip', sample.blob, sample.fileName);
  form.append('name', name);
  form.append('language', language.split('-')[0].toLowerCase());
  if (description) form.append('description', description);
  const payload = await readJson(await fetch('https://api.cartesia.ai/voices/clone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Cartesia-Version': process.env.CARTESIA_API_VERSION?.trim() || '2026-08-14',
    },
    body: form,
  }));
  const voiceId = String(payload?.id || payload?.voice_id || '').trim();
  if (!voiceId) throw new Error('clone-route-b-empty');
  return {
    voiceId,
    capabilities: ['tts','voice_change'],
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  const tools = getToolAvailability();

  if (req.method === 'GET') {
    try {
      await syncNaylaVoiceCatalog().catch((error) => {
        console.warn('[nayla-voices] catalog sync partial failure', error);
      });
      const voices = await listNaylaVoices(user.uid);
      return res.status(200).json({
        configured: voices.length > 0,
        voices,
        tools,
        totalCount: voices.length,
      });
    } catch (error) {
      console.error('[generar/audio-voices] unified list failed', error);
      return res.status(502).json({
        error: 'Nayla no pudo leer la biblioteca de voces en este intento.',
      });
    }
  }

  if (req.method === 'POST') {
    if (!tools.clone) {
      return res.status(503).json({
        error: 'La clonación de voz todavía no tiene una ruta activa.',
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

      const samples: Sample[] = [];
      let totalBytes = 0;

      for (let index = 0; index < ordered.length; index++) {
        const item: any = ordered[index];
        const sourceUrl =
          typeof item.r2_key === 'string' && item.r2_key
            ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 900 }).url
            : typeof item.url === 'string' && item.url.startsWith('https://')
              ? item.url
              : null;

        if (!sourceUrl) throw new Error('Una muestra no tiene una fuente de audio válida.');

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
        samples.push({
          blob: new Blob([buffer], { type: contentType }),
          fileName:
            typeof item.nombre === 'string' && item.nombre.trim()
              ? item.nombre
              : `muestra-${index + 1}.mp3`,
        });
      }

      const routes: PrivateVoiceRoutes = {};
      const failures: string[] = [];
      const verification: boolean[] = [];

      try {
        const route = await cloneWithRouteA({
          samples,
          name: parsed.data.name,
          description: parsed.data.description,
          removeBackgroundNoise: parsed.data.removeBackgroundNoise,
        });
        if (route) {
          routes.elevenlabs = route;
          verification.push(Boolean(route.requiresVerification));
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'route-a');
      }

      try {
        const route = await cloneWithRouteB({
          sample: samples[0],
          name: parsed.data.name,
          description: parsed.data.description,
          language: parsed.data.language,
        });
        if (route) routes.cartesia = route;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'route-b');
      }

      if (!Object.keys(routes).length) {
        console.warn('[nayla-voices] clone routes failed', failures);
        return res.status(502).json({
          error: 'Nayla no pudo crear la voz con ninguna ruta disponible en este intento.',
        });
      }

      const voice = await createNaylaClonedVoice({
        userId: user.uid,
        name: parsed.data.name,
        description: parsed.data.description,
        language: parsed.data.language,
        routes,
        metadata: {
          sampleCount: samples.length,
          routeCount: Object.keys(routes).length,
          requiresVerification: verification.some(Boolean),
        },
      });

      return res.status(201).json({
        configured: true,
        voice,
        message: verification.some(Boolean)
          ? 'Voz creada. Una de sus rutas requiere verificación antes de poder usarse.'
          : Object.keys(routes).length > 1
            ? 'Voz creada con respaldo automático en más de una ruta.'
            : 'Voz creada y añadida a tu biblioteca.',
      });
    } catch (error) {
      console.error('[generar/audio-voices] clone failed', error);
      const raw = error instanceof Error ? error.message : '';
      return res.status(502).json({
        error:
          /muestra|límite|pertenecen|fuente/i.test(raw)
            ? raw
            : 'Nayla no pudo crear la voz en este intento.',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Usa GET o POST.' });
}

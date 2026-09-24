import type { NaylaAction } from '../naylaActions';
import type { MediaProviderId } from './types';

export type CloudOutput =
  | {
      kind: 'binary';
      bytes: Uint8Array;
      contentType: string;
      extension: string;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'url';
      url: string;
      contentType?: string;
      extension?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'text';
      text: string;
      metadata?: Record<string, unknown>;
    };

export type CloudProviderStart =
  | {
      state: 'queued';
      providerJobId: string;
      metadata: Record<string, unknown>;
    }
  | {
      state: 'completed';
      output: CloudOutput;
      metadata?: Record<string, unknown>;
    };

export type CloudProviderPoll =
  | {
      state: 'queued' | 'running';
      metadata?: Record<string, unknown>;
    }
  | {
      state: 'completed';
      output: CloudOutput;
      metadata?: Record<string, unknown>;
    }
  | {
      state: 'failed';
      error: string;
      metadata?: Record<string, unknown>;
    };

export class UnsupportedCloudExecutionError extends Error {}
export class ProviderCapacityError extends Error {}

const requiredEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new UnsupportedCloudExecutionError(`${key} no está configurada.`);
  return value;
};

const jsonRequest = async (
  url: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<any> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text.slice(0, 2000) };
    }
    if (!response.ok) {
      const detail =
        payload?.detail?.message ||
        payload?.detail ||
        payload?.message ||
        payload?.error ||
        payload?.raw ||
        `HTTP ${response.status}`;
      const message = typeof detail === 'string'
        ? detail
        : JSON.stringify(detail).slice(0, 2000);
      if (
        response.status === 402 ||
        response.status === 429 ||
        /quota[_ -]?exceeded|insufficient.{0,24}(credit|quota|balance)|rate.{0,12}limit|too many requests|credits? exhausted|out of credits/i.test(message)
      ) {
        throw new ProviderCapacityError(message);
      }
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const binaryRequest = async (
  url: string,
  init: RequestInit,
  fallbackType: string,
  fallbackExtension: string,
  timeoutMs = 90_000
): Promise<CloudOutput> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const message = text.slice(0, 2000) || `HTTP ${response.status}`;
      if (
        response.status === 402 ||
        response.status === 429 ||
        /quota[_ -]?exceeded|insufficient.{0,24}(credit|quota|balance)|rate.{0,12}limit|too many requests|credits? exhausted|out of credits/i.test(message)
      ) {
        throw new ProviderCapacityError(message);
      }
      throw new Error(message);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.length) throw new Error('El motor devolvió un archivo vacío.');
    return {
      kind: 'binary',
      bytes: buffer,
      contentType: response.headers.get('content-type')?.split(';')[0] || fallbackType,
      extension: fallbackExtension,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const urlExtension = (value: string, fallback: string) => {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    return match?.[1] || fallback;
  } catch {
    return fallback;
  }
};

const findOutputUrl = (
  value: unknown,
  domain: 'image' | 'video' | 'audio' | '3d'
): string | null => {
  const preferredKeys: Record<typeof domain, string[]> = {
    image: ['rendered_image', 'image', 'images', 'url', 'output', 'image_url', 'generated_image'],
    video: ['video', 'url', 'output', 'video_url'],
    audio: ['audio', 'url', 'output', 'audio_url'],
    '3d': ['rigged_character_glb_url', 'model_url', 'glb', 'pbr_model', 'base_model', 'model', 'url', 'output', 'model_urls'],
  };

  const walk = (node: unknown, keyHint = ''): string | null => {
    const direct = safeHttpsUrl(node);
    if (direct) {
      if (domain === 'image' && /\.(png|jpe?g|webp)(\?|$)/i.test(direct)) return direct;
      if (domain === 'video' && /\.(mp4|webm|mov)(\?|$)/i.test(direct)) return direct;
      if (domain === 'audio' && /\.(mp3|wav|m4a|ogg|flac)(\?|$)/i.test(direct)) return direct;
      if (domain === '3d' && /\.(glb|gltf|fbx|obj|stl|usdz)(\?|$)/i.test(direct)) return direct;
      if (preferredKeys[domain].some((key) => keyHint.toLowerCase().includes(key))) return direct;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, keyHint);
        if (found) return found;
      }
      return null;
    }

    if (node && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      const ordered = [
        ...entries.filter(([key]) => preferredKeys[domain].some((preferred) => key.toLowerCase().includes(preferred))),
        ...entries.filter(([key]) => !preferredKeys[domain].some((preferred) => key.toLowerCase().includes(preferred))),
      ];
      for (const [key, child] of ordered) {
        const found = walk(child, key);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(value);
};

const domainForAction = (action: NaylaAction): 'image' | 'video' | 'audio' | '3d' => {
  if (action.action === 'GENERATE_IMAGE') return 'image';
  if (action.action === 'GENERATE_VIDEO') return 'video';
  if (action.action === 'GENERATE_AUDIO') return 'audio';
  if (action.action === 'GENERATE_3D') return '3d';
  throw new UnsupportedCloudExecutionError('La acción no pertenece a Nayla Cloud.');
};

const falModelAndInput = (action: NaylaAction) => {
  if (action.action === 'GENERATE_IMAGE') {
    const model = action.sourceImageUrl
      ? process.env.FAL_IMAGE_EDIT_MODEL?.trim() || 'fal-ai/flux/dev/image-to-image'
      : process.env.FAL_IMAGE_MODEL?.trim() || 'fal-ai/flux/dev';
    return {
      model,
      input: action.sourceImageUrl
        ? { prompt: action.prompt, image_url: action.sourceImageUrl }
        : { prompt: action.prompt, num_images: 1 },
    };
  }

  if (action.action === 'GENERATE_VIDEO') {
    const model = action.sourceImageUrl
      ? process.env.FAL_IMAGE_TO_VIDEO_MODEL?.trim() || 'fal-ai/kling-video/v3/standard/image-to-video'
      : process.env.FAL_VIDEO_MODEL?.trim() || 'fal-ai/kling-video/v3/turbo/standard/text-to-video';
    return {
      model,
      input: action.sourceImageUrl
        ? { prompt: action.prompt, start_image_url: action.sourceImageUrl, duration: '5', generate_audio: false }
        : { prompt: action.prompt, duration: '5', generate_audio: false },
    };
  }

  if (action.action === 'GENERATE_AUDIO' && (action.mode === 'music' || action.mode === 'sound_effects')) {
    const model = process.env.FAL_AUDIO_MODEL?.trim() || 'fal-ai/stable-audio-25/text-to-audio';
    return {
      model,
      input: {
        prompt: action.prompt || action.text || 'cinematic instrumental audio',
      },
    };
  }

  if (action.action === 'GENERATE_3D') {
    const model = process.env.FAL_3D_MODEL?.trim();
    if (!model) {
      throw new UnsupportedCloudExecutionError('La ruta 3D de este motor necesita FAL_3D_MODEL.');
    }
    const input: Record<string, unknown> = { prompt: action.prompt || '' };
    if (action.inputUrl) input.image_url = action.inputUrl;
    if (action.inputUrls?.length) input.image_urls = action.inputUrls;
    return { model, input };
  }

  throw new UnsupportedCloudExecutionError('Esta operación no está implementada en este motor.');
};

const startFal = async (action: NaylaAction): Promise<CloudProviderStart> => {
  const apiKey = requiredEnv('FAL_KEY');
  const { model, input } = falModelAndInput(action);
  const payload = await jsonRequest(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const requestId = String(payload.request_id || payload.requestId || '');
  if (!requestId) throw new Error('El motor no devolvió un identificador de trabajo.');

  return {
    state: 'queued',
    providerJobId: requestId,
    metadata: {
      model,
      statusUrl: payload.status_url || payload.statusUrl || null,
      responseUrl: payload.response_url || payload.responseUrl || null,
    },
  };
};

const pollFal = async (
  action: NaylaAction,
  providerJobId: string,
  metadata: Record<string, unknown>
): Promise<CloudProviderPoll> => {
  const apiKey = requiredEnv('FAL_KEY');
  const model = String(metadata.model || '');
  const statusUrl =
    safeHttpsUrl(metadata.statusUrl) ||
    `https://queue.fal.run/${model}/requests/${providerJobId}/status`;
  const responseUrl =
    safeHttpsUrl(metadata.responseUrl) ||
    `https://queue.fal.run/${model}/requests/${providerJobId}`;

  const status = await jsonRequest(statusUrl, {
    method: 'GET',
    headers: { Authorization: `Key ${apiKey}` },
  });

  const state = String(status.status || status.state || '').toUpperCase();
  if (['FAILED', 'ERROR', 'CANCELLED'].includes(state)) {
    return { state: 'failed', error: String(status.error || 'La generación falló.') };
  }
  if (!['COMPLETED', 'SUCCEEDED', 'SUCCESS'].includes(state)) {
    return { state: state === 'IN_PROGRESS' || state === 'RUNNING' ? 'running' : 'queued' };
  }

  const result = await jsonRequest(responseUrl, {
    method: 'GET',
    headers: { Authorization: `Key ${apiKey}` },
  });
  const domain = domainForAction(action);
  const outputUrl = findOutputUrl(result, domain);
  if (!outputUrl) throw new Error('La generación terminó sin un archivo utilizable.');

  return {
    state: 'completed',
    output: {
      kind: 'url',
      url: outputUrl,
      extension: urlExtension(outputUrl, domain === 'image' ? 'png' : domain === 'video' ? 'mp4' : domain === 'audio' ? 'wav' : 'glb'),
      metadata: { requestId: providerJobId },
    },
  };
};

const replicateModelAndInput = (action: NaylaAction) => {
  if (action.action === 'GENERATE_IMAGE') {
    if (action.sourceImageUrl) {
      const model = process.env.REPLICATE_IMAGE_EDIT_MODEL?.trim();
      if (!model) throw new UnsupportedCloudExecutionError('REPLICATE_IMAGE_EDIT_MODEL no está configurado.');
      return { model, input: { prompt: action.prompt, image: action.sourceImageUrl } };
    }
    return {
      model: process.env.REPLICATE_IMAGE_MODEL?.trim() || 'black-forest-labs/flux-schnell',
      input: { prompt: action.prompt, num_outputs: 1 },
    };
  }

  if (action.action === 'GENERATE_VIDEO') {
    return {
      model: process.env.REPLICATE_VIDEO_MODEL?.trim() || 'google/veo-3.1-fast',
      input: {
        prompt: action.prompt,
        ...(action.sourceImageUrl ? { image: action.sourceImageUrl } : {}),
        duration: 4,
        resolution: '720p',
        generate_audio: false,
      },
    };
  }

  throw new UnsupportedCloudExecutionError('Esta operación no está implementada en este motor.');
};

const startReplicate = async (action: NaylaAction): Promise<CloudProviderStart> => {
  const token = requiredEnv('REPLICATE_API_TOKEN');
  const { model, input } = replicateModelAndInput(action);
  const payload = await jsonRequest(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  }, 70_000);

  const id = String(payload.id || '');
  if (!id) throw new Error('El motor no devolvió un identificador de trabajo.');

  if (String(payload.status).toLowerCase() === 'succeeded') {
    const outputUrl = findOutputUrl(payload.output, domainForAction(action));
    if (!outputUrl) throw new Error('La generación terminó sin un archivo utilizable.');
    return {
      state: 'completed',
      output: { kind: 'url', url: outputUrl },
      metadata: { model },
    };
  }

  return {
    state: 'queued',
    providerJobId: id,
    metadata: {
      model,
      getUrl: payload.urls?.get || `https://api.replicate.com/v1/predictions/${id}`,
    },
  };
};

const pollReplicate = async (
  action: NaylaAction,
  providerJobId: string,
  metadata: Record<string, unknown>
): Promise<CloudProviderPoll> => {
  const token = requiredEnv('REPLICATE_API_TOKEN');
  const getUrl = safeHttpsUrl(metadata.getUrl) || `https://api.replicate.com/v1/predictions/${providerJobId}`;
  const payload = await jsonRequest(getUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const status = String(payload.status || '').toLowerCase();
  if (['failed', 'canceled', 'cancelled'].includes(status)) {
    return { state: 'failed', error: String(payload.error || 'La generación falló.') };
  }
  if (status !== 'succeeded') {
    return { state: status === 'processing' || status === 'running' ? 'running' : 'queued' };
  }

  const outputUrl = findOutputUrl(payload.output, domainForAction(action));
  if (!outputUrl) throw new Error('La generación terminó sin un archivo utilizable.');
  return {
    state: 'completed',
    output: { kind: 'url', url: outputUrl },
    metadata: { metrics: payload.metrics || null },
  };
};

const startDeepgram = async (action: NaylaAction): Promise<CloudProviderStart> => {
  if (action.action !== 'GENERATE_AUDIO') {
    throw new UnsupportedCloudExecutionError('Esta operación no es de audio.');
  }
  const key = requiredEnv('DEEPGRAM_API_KEY');

  if (action.mode === 'tts') {
    const requestedLanguage = (action.targetLanguage || '').trim().toLowerCase();
    const defaultModel = requestedLanguage.startsWith('en')
      ? 'aura-2-thalia-en'
      : 'aura-2-celeste-es';
    const model =
      action.voiceId ||
      process.env.DEEPGRAM_TTS_MODEL?.trim() ||
      defaultModel;
    const output = await binaryRequest(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: action.text || action.prompt || '' }),
      },
      'audio/mpeg',
      'mp3'
    );
    return { state: 'completed', output, metadata: { model } };
  }

  if (action.mode === 'speech_to_text') {
    if (!action.inputUrl) throw new Error('La transcripción necesita un audio o video de entrada.');
    const payload = await jsonRequest(
      `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(process.env.DEEPGRAM_STT_MODEL?.trim() || 'nova-3')}&smart_format=true&language=${encodeURIComponent(action.targetLanguage || 'multi')}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: action.inputUrl }),
      },
      90_000
    );
    const transcript = String(payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
    if (!transcript) throw new Error('La transcripción terminó sin texto.');
    return {
      state: 'completed',
      output: { kind: 'text', text: transcript },
      metadata: { language: payload?.results?.channels?.[0]?.detected_language || null },
    };
  }

  throw new UnsupportedCloudExecutionError('Este modo de audio no está implementado en este motor.');
};

const startCartesia = async (action: NaylaAction): Promise<CloudProviderStart> => {
  if (action.action !== 'GENERATE_AUDIO') {
    throw new UnsupportedCloudExecutionError('Esta operación no es de audio.');
  }
  const key = requiredEnv('CARTESIA_API_KEY');
  const apiVersion = process.env.CARTESIA_API_VERSION?.trim() || '2026-08-14';
  const headers = {
    Authorization: `Bearer ${key}`,
    'Cartesia-Version': apiVersion,
  };

  if (action.mode === 'tts') {
    const voice =
      action.voiceId ||
      process.env.CARTESIA_DEFAULT_VOICE_ID?.trim() ||
      'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';
    const model = process.env.CARTESIA_TTS_MODEL?.trim() || 'sonic-3.6';
    const output = await binaryRequest(
      'https://api.cartesia.ai/tts/bytes',
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: model,
          transcript: action.text || action.prompt || '',
          voice,
          output_format: {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: 44100,
          },
          ...(action.targetLanguage ? { language: action.targetLanguage } : {}),
        }),
      },
      'audio/wav',
      'wav'
    );
    return { state: 'completed', output, metadata: { model } };
  }

  if (action.mode === 'speech_to_text') {
    if (!action.inputUrl) throw new Error('La transcripción necesita un audio o video de entrada.');
    const blob = await fetchedBlobForForm(action.inputUrl);
    const form = new FormData();
    form.append('file', blob, 'input');
    form.append('model', process.env.CARTESIA_STT_MODEL?.trim() || 'ink-whisper');
    if (action.targetLanguage) form.append('language', action.targetLanguage);
    const payload = await jsonRequest(
      'https://api.cartesia.ai/stt',
      { method: 'POST', headers, body: form },
      120_000
    );
    const transcript = String(payload?.text || '').trim();
    if (!transcript) throw new Error('La transcripción terminó sin texto.');
    return { state: 'completed', output: { kind: 'text', text: transcript } };
  }

  if (action.mode === 'voice_change') {
    if (!action.inputUrl) throw new Error('El cambio de voz necesita un audio de entrada.');
    if (!action.voiceId) throw new Error('El cambio de voz necesita una voz de salida.');
    const blob = await fetchedBlobForForm(action.inputUrl);
    const form = new FormData();
    form.append('clip', blob, 'input');
    form.append('voice_id', action.voiceId);
    form.append('output_format[container]', 'wav');
    form.append('output_format[sample_rate]', '44100');
    form.append('output_format[encoding]', 'pcm_s16le');
    const output = await binaryRequest(
      'https://api.cartesia.ai/voice-changer/bytes',
      { method: 'POST', headers, body: form },
      'audio/wav',
      'wav',
      120_000
    );
    return { state: 'completed', output };
  }

  throw new UnsupportedCloudExecutionError('Este modo de audio no está implementado en este motor.');
};

const fetchedBlobForForm = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo leer el archivo de entrada (HTTP ${response.status}).`);
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 80 * 1024 * 1024) {
    throw new Error('El archivo de entrada supera el límite de 80 MB para esta operación.');
  }
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: contentType });
};

const elevenHeaders = (key: string) => ({ 'xi-api-key': key });

const startElevenLabs = async (action: NaylaAction): Promise<CloudProviderStart> => {
  if (action.action !== 'GENERATE_AUDIO') {
    throw new UnsupportedCloudExecutionError('Esta operación no es de audio.');
  }
  const key = requiredEnv('ELEVENLABS_API_KEY');
  const voiceId =
    action.voiceId ||
    process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() ||
    'JBFqnCBsd6RMkjVDRZzb';

  if (action.mode === 'tts') {
    const output = await binaryRequest(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          ...elevenHeaders(key),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: action.text || action.prompt || '',
          model_id: process.env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_multilingual_v2',
        }),
      },
      'audio/mpeg',
      'mp3'
    );
    return { state: 'completed', output };
  }

  if (action.mode === 'music') {
    const output = await binaryRequest(
      'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          ...elevenHeaders(key),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: action.prompt || action.text || 'cinematic instrumental music',
        }),
      },
      'audio/mpeg',
      'mp3',
      120_000
    );
    return { state: 'completed', output };
  }

  if (action.mode === 'sound_effects') {
    const output = await binaryRequest(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          ...elevenHeaders(key),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: action.prompt || action.text || 'cinematic sound effect',
        }),
      },
      'audio/mpeg',
      'mp3'
    );
    return { state: 'completed', output };
  }

  if (action.mode === 'speech_to_text') {
    if (!action.inputUrl) throw new Error('La transcripción necesita un audio o video de entrada.');
    const form = new FormData();
    const blob = await fetchedBlobForForm(action.inputUrl);
    form.append('file', blob, 'input');
    form.append('model_id', process.env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v2');
    const payload = await jsonRequest('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: elevenHeaders(key),
      body: form,
    }, 120_000);
    const transcript = String(payload.text || '').trim();
    if (!transcript) throw new Error('La transcripción terminó sin texto.');
    return { state: 'completed', output: { kind: 'text', text: transcript } };
  }

  if (action.mode === 'voice_change') {
    if (!action.inputUrl) throw new Error('El cambio de voz necesita un audio de entrada.');
    const form = new FormData();
    const blob = await fetchedBlobForForm(action.inputUrl);
    form.append('audio', blob, 'input');
    form.append('model_id', process.env.ELEVENLABS_STS_MODEL?.trim() || 'eleven_multilingual_sts_v2');
    const output = await binaryRequest(
      `https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: elevenHeaders(key), body: form },
      'audio/mpeg',
      'mp3',
      120_000
    );
    return { state: 'completed', output };
  }

  if (action.mode === 'voice_isolation') {
    if (!action.inputUrl) throw new Error('El aislamiento necesita un audio de entrada.');
    const form = new FormData();
    const blob = await fetchedBlobForForm(action.inputUrl);
    form.append('audio', blob, 'input');
    const output = await binaryRequest(
      'https://api.elevenlabs.io/v1/audio-isolation',
      { method: 'POST', headers: elevenHeaders(key), body: form },
      'audio/mpeg',
      'mp3',
      120_000
    );
    return { state: 'completed', output };
  }

  if (action.mode === 'text_to_dialogue') {
    const text = action.text || action.prompt || '';
    const output = await binaryRequest(
      'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          ...elevenHeaders(key),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [{ text, voice_id: voiceId }],
        }),
      },
      'audio/mpeg',
      'mp3'
    );
    return { state: 'completed', output };
  }

  throw new UnsupportedCloudExecutionError('Este modo de audio requiere un adaptador especializado adicional.');
};

const imageFileType = (url: string) => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'png';
    if (pathname.endsWith('.webp')) return 'webp';
  } catch {
    // Use the most widely accepted type when the signed URL has no suffix.
  }
  return 'jpg';
};

const tripoPayloadForAction = (action: NaylaAction) => {
  if (action.action === 'GENERATE_IMAGE') {
    if (action.sourceImageUrl) {
      return {
        type: 'generate_image',
        model_version:
          process.env.TRIPO_IMAGE_MODEL?.trim() ||
          'flux.1_kontext_pro',
        prompt: action.prompt,
        file: {
          type: imageFileType(action.sourceImageUrl),
          url: action.sourceImageUrl,
        },
      };
    }
    return {
      type: 'text_to_image',
      prompt: action.prompt,
    };
  }

  if (action.action !== 'GENERATE_3D') {
    throw new UnsupportedCloudExecutionError('Este motor se usa para imagen y 3D.');
  }

  const modelVersion = process.env.TRIPO_3D_MODEL?.trim() || 'v3.1-20260211';

  if (action.mode === 'text_to_3d') {
    return {
      type: 'text_to_model',
      model_version: modelVersion,
      prompt: action.prompt || '',
      texture: true,
      pbr: true,
    };
  }

  if (action.mode === 'image_to_3d') {
    if (!action.inputUrl) throw new Error('Imagen → 3D necesita una imagen.');
    return {
      type: 'image_to_model',
      model_version: modelVersion,
      file: {
        type: imageFileType(action.inputUrl),
        url: action.inputUrl,
      },
      texture: true,
      pbr: true,
    };
  }

  if (action.mode === 'multiview_to_3d') {
    const urls = (action.inputUrls || []).slice(0, 4);
    if (urls.length < 2) throw new Error('Multivista → 3D necesita al menos dos imágenes.');
    const files: Array<Record<string, string>> = urls.map((url) => ({
      type: imageFileType(url),
      url,
    }));
    while (files.length < 4) files.push({});
    return {
      type: 'multiview_to_model',
      model_version: process.env.TRIPO_MULTIVIEW_MODEL?.trim() || modelVersion,
      files,
      texture: true,
      pbr: true,
    };
  }

  throw new UnsupportedCloudExecutionError(
    'Esta operación sobre un modelo existente se ejecuta por otra ruta de Nayla Cloud.'
  );
};

const startTripo = async (action: NaylaAction): Promise<CloudProviderStart> => {
  const key = requiredEnv('TRIPO_API_KEY');
  const payload = await jsonRequest('https://api.tripo3d.ai/v2/openapi/task', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tripoPayloadForAction(action)),
  });

  if (Number(payload.code) !== 0) {
    throw new Error(String(payload.message || 'No se pudo iniciar la generación.'));
  }
  const taskId = String(payload?.data?.task_id || '');
  if (!taskId) throw new Error('El motor 3D no devolvió un identificador de trabajo.');
  return { state: 'queued', providerJobId: taskId, metadata: { apiVersion: 'v2' } };
};

const pollTripo = async (
  action: NaylaAction,
  providerJobId: string
): Promise<CloudProviderPoll> => {
  const key = requiredEnv('TRIPO_API_KEY');
  const payload = await jsonRequest(
    `https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(providerJobId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    }
  );
  if (Number(payload.code) !== 0) {
    return { state: 'failed', error: String(payload.message || 'La generación falló.') };
  }
  const data = payload.data || {};
  const status = String(data.status || '').toLowerCase();
  if (['failed', 'cancelled', 'canceled'].includes(status)) {
    return { state: 'failed', error: String(data.error || data.message || 'La generación falló.') };
  }
  if (!['success', 'succeeded', 'completed'].includes(status)) {
    return {
      state: ['running', 'processing'].includes(status) ? 'running' : 'queued',
      metadata: { progress: data.progress ?? null },
    };
  }

  const domain = domainForAction(action);
  const outputUrl = findOutputUrl(data.output || data, domain);
  if (!outputUrl) throw new Error('La generación terminó sin un archivo utilizable.');
  return {
    state: 'completed',
    output: {
      kind: 'url',
      url: outputUrl,
      extension: urlExtension(outputUrl, domain === 'image' ? 'png' : 'glb'),
    },
    metadata: { progress: data.progress ?? 100 },
  };
};

const startMeshy = async (action: NaylaAction): Promise<CloudProviderStart> => {
  if (action.action !== 'GENERATE_3D') {
    throw new UnsupportedCloudExecutionError('Este motor se usa para 3D.');
  }
  const key = requiredEnv('MESHY_API_KEY');
  let endpoint = '';
  let body: Record<string, unknown> = {};

  if (action.mode === 'text_to_3d') {
    endpoint = '/openapi/v2/text-to-3d';
    body = {
      mode: 'preview',
      prompt: action.prompt || '',
      ai_model: process.env.MESHY_3D_MODEL?.trim() || 'latest',
      target_formats: ['glb'],
    };
  } else if (action.mode === 'image_to_3d') {
    if (!action.inputUrl) throw new Error('Imagen → 3D necesita una imagen.');
    endpoint = '/openapi/v1/image-to-3d';
    body = {
      image_url: action.inputUrl,
      ai_model: process.env.MESHY_3D_MODEL?.trim() || 'latest',
      target_formats: ['glb'],
      should_texture: true,
      enable_pbr: true,
    };
  } else if (action.mode === 'multiview_to_3d') {
    const imageUrls = (action.inputUrls || []).slice(0, 4);
    if (imageUrls.length < 2) throw new Error('Multivista → 3D necesita al menos dos imágenes.');
    endpoint = '/openapi/v1/multi-image-to-3d';
    body = {
      image_urls: imageUrls,
      ai_model: process.env.MESHY_3D_MODEL?.trim() || 'latest',
      target_formats: ['glb'],
      should_texture: true,
      enable_pbr: true,
    };
  } else if (action.mode === 'texture') {
    if (!action.inputUrl) throw new Error('Texturizar necesita un modelo 3D de entrada.');
    endpoint = '/openapi/v1/retexture';
    body = {
      model_url: action.inputUrl,
      text_style_prompt: action.prompt || 'preserve the original visual identity',
      ai_model: process.env.MESHY_3D_MODEL?.trim() || 'latest',
      enable_pbr: true,
      enable_original_uv: true,
      target_formats: ['glb'],
    };
  } else if (action.mode === 'optimize') {
    if (!action.inputUrl) throw new Error('Optimizar necesita un modelo 3D de entrada.');
    endpoint = '/openapi/v1/remesh';
    body = {
      model_url: action.inputUrl,
      target_formats: ['glb'],
      topology: 'triangle',
      target_polycount: 30000,
    };
  } else if (action.mode === 'rig') {
    if (!action.inputUrl) throw new Error('Rigging necesita un GLB de entrada.');
    endpoint = '/openapi/v1/rigging';
    body = {
      model_url: action.inputUrl,
      height_meters: 1.8,
    };
  } else {
    throw new UnsupportedCloudExecutionError(
      'Esta operación 3D necesita información adicional antes de ejecutarse.'
    );
  }

  const payload = await jsonRequest(`https://api.meshy.ai${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const taskId = String(payload.result || '');
  if (!taskId) throw new Error('El motor 3D no devolvió un identificador de trabajo.');

  return {
    state: 'queued',
    providerJobId: taskId,
    metadata: { endpoint },
  };
};

const pollMeshy = async (
  providerJobId: string,
  metadata: Record<string, unknown>
): Promise<CloudProviderPoll> => {
  const key = requiredEnv('MESHY_API_KEY');
  const endpoint = String(metadata.endpoint || '');
  if (!endpoint) throw new Error('Falta el endpoint del trabajo 3D.');
  const payload = await jsonRequest(
    `https://api.meshy.ai${endpoint}/${encodeURIComponent(providerJobId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    }
  );
  const status = String(payload.status || '').toUpperCase();
  if (status === 'FAILED') {
    return {
      state: 'failed',
      error: String(payload.task_error?.message || 'La generación 3D falló.'),
    };
  }
  if (status !== 'SUCCEEDED') {
    return {
      state: status === 'IN_PROGRESS' ? 'running' : 'queued',
      metadata: { progress: payload.progress ?? null },
    };
  }
  const outputUrl =
    safeHttpsUrl(payload?.model_urls?.glb) ||
    safeHttpsUrl(payload?.result?.rigged_character_glb_url) ||
    findOutputUrl(payload, '3d');
  if (!outputUrl) throw new Error('La generación 3D terminó sin un GLB utilizable.');
  return {
    state: 'completed',
    output: { kind: 'url', url: outputUrl, extension: 'glb' },
    metadata: { progress: payload.progress ?? 100 },
  };
};

export const providerCanExecuteAction = (
  provider: MediaProviderId,
  action: NaylaAction
): boolean => {
  if (provider === 'fal') {
    return (
      action.action === 'GENERATE_IMAGE' ||
      action.action === 'GENERATE_VIDEO' ||
      (action.action === 'GENERATE_AUDIO' && ['music', 'sound_effects'].includes(action.mode)) ||
      (action.action === 'GENERATE_3D' && Boolean(process.env.FAL_3D_MODEL?.trim()))
    );
  }
  if (provider === 'replicate') {
    return action.action === 'GENERATE_IMAGE' || action.action === 'GENERATE_VIDEO';
  }
  if (provider === 'deepgram') {
    return action.action === 'GENERATE_AUDIO' && ['tts', 'speech_to_text'].includes(action.mode);
  }
  if (provider === 'cartesia') {
    return (
      action.action === 'GENERATE_AUDIO' &&
      ['tts', 'speech_to_text', 'voice_change'].includes(action.mode)
    );
  }
  if (provider === 'elevenlabs') {
    return (
      action.action === 'GENERATE_AUDIO' &&
      ['tts', 'music', 'sound_effects', 'speech_to_text', 'voice_change', 'voice_isolation', 'text_to_dialogue'].includes(action.mode)
    );
  }
  if (provider === 'tripo') {
    return (
      action.action === 'GENERATE_IMAGE' ||
      (action.action === 'GENERATE_3D' &&
        ['text_to_3d', 'image_to_3d', 'multiview_to_3d'].includes(action.mode))
    );
  }
  if (provider === 'meshy') {
    return (
      action.action === 'GENERATE_3D' &&
      ['text_to_3d', 'image_to_3d', 'multiview_to_3d', 'texture', 'optimize', 'rig'].includes(action.mode)
    );
  }
  return false;
};

export const startCloudProviderExecution = async (
  provider: MediaProviderId,
  action: NaylaAction
): Promise<CloudProviderStart> => {
  if (provider === 'fal') return startFal(action);
  if (provider === 'replicate') return startReplicate(action);
  if (provider === 'deepgram') return startDeepgram(action);
  if (provider === 'cartesia') return startCartesia(action);
  if (provider === 'elevenlabs') return startElevenLabs(action);
  if (provider === 'tripo') return startTripo(action);
  if (provider === 'meshy') return startMeshy(action);
  throw new UnsupportedCloudExecutionError('La ruta seleccionada no ejecuta Nayla Cloud.');
};

export const pollCloudProviderExecution = async ({
  provider,
  action,
  providerJobId,
  metadata,
}: {
  provider: MediaProviderId;
  action: NaylaAction;
  providerJobId: string;
  metadata: Record<string, unknown>;
}): Promise<CloudProviderPoll> => {
  if (provider === 'fal') return pollFal(action, providerJobId, metadata);
  if (provider === 'replicate') return pollReplicate(action, providerJobId, metadata);
  if (provider === 'tripo') return pollTripo(action, providerJobId);
  if (provider === 'meshy') return pollMeshy(providerJobId, metadata);
  throw new UnsupportedCloudExecutionError('Este trabajo no usa polling.');
};

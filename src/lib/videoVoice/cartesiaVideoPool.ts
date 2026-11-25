/**
 * Dedicated server-side voice pool for future ChatGPT video production.
 * This module deliberately does NOT read CARTESIA_API_KEY or any existing
 * Nayla/provider credential. No outgoing requests until explicitly enabled.
 */
export const VIDEO_CARTESIA_KEY_NAMES = [
  'CARTESIA_VIDEO_API_KEY_01',
  'CARTESIA_VIDEO_API_KEY_02',
  'CARTESIA_VIDEO_API_KEY_03',
  'CARTESIA_VIDEO_API_KEY_04',
  'CARTESIA_VIDEO_API_KEY_05',
  'CARTESIA_VIDEO_API_KEY_06',
] as const;

export type VideoVoiceEnv = Record<string, string | undefined>;
type Slot = { name: (typeof VIDEO_CARTESIA_KEY_NAMES)[number]; secret: string };
type Fetcher = typeof fetch;
export type VideoVoiceResult = {
  provider: 'cartesia';
  slot: (typeof VIDEO_CARTESIA_KEY_NAMES)[number];
  audio: Uint8Array;
  contentType: 'audio/wav';
};
const ENDPOINT = 'https://api.cartesia.ai/tts/bytes';
const MAX_TEXT_CHARS = 360;
const MAX_AUDIO_BYTES = 2_000_000;

export function configuredVideoCartesiaSlots(env: VideoVoiceEnv = process.env): Slot[] {
  const seen = new Set<string>();
  const configured: Slot[] = [];
  for (const name of VIDEO_CARTESIA_KEY_NAMES) {
    const secret = (env[name] || '').trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    configured.push({ name, secret });
  }
  return configured;
}

export function videoVoiceReadiness(env: VideoVoiceEnv = process.env) {
  return {
    enabled: env.NAYLA_VIDEO_TTS_ENABLED === 'true',
    configuredSlots: configuredVideoCartesiaSlots(env).map((slot) => slot.name),
    voiceConfigured: Boolean((env.CARTESIA_VIDEO_VOICE_ID || '').trim()),
  };
}

export function createVideoCartesiaPool({
  env = process.env,
  fetcher = fetch,
}: { env?: VideoVoiceEnv; fetcher?: Fetcher } = {}) {
  // A pool instance should be reused across requests if round-robin is wanted.
  const slots = configuredVideoCartesiaSlots(env);
  let cursor = 0;

  return {
    readiness: () => videoVoiceReadiness(env),
    async synthesize(text: string, language: 'es' | 'en' = 'es'): Promise<VideoVoiceResult> {
      if (env.NAYLA_VIDEO_TTS_ENABLED !== 'true') throw new Error('VIDEO_VOICE_DISABLED');
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS ||
          /[\u0000-\u001f\u007f<>]/u.test(text)) throw new Error('INVALID_VIDEO_VOICE_TEXT');
      if (language !== 'es' && language !== 'en') throw new Error('INVALID_VIDEO_VOICE_LANGUAGE');
      const voice = (env.CARTESIA_VIDEO_VOICE_ID || '').trim();
      if (!voice || !/^[a-zA-Z0-9-]{8,128}$/.test(voice)) throw new Error('VIDEO_VOICE_NOT_CONFIGURED');
      if (!slots.length) throw new Error('NO_DEDICATED_CARTESIA_KEYS');

      const selected = slots[cursor % slots.length];
      cursor += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetcher(ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: 'Bearer ' + selected.secret,
            'Cartesia-Version': '2026-08-14',
            'Content-Type': 'application/json',
            Accept: 'audio/wav',
          },
          body: JSON.stringify({
            model_id: 'sonic-3.6',
            transcript: text.trim(),
            voice: { mode: 'id', id: voice },
            language,
            output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
          }),
        });
        // Never include provider body or authorization details in returned errors.
        if (response.status === 429) throw new Error('CARTESIA_QUOTA_REACHED');
        if (!response.ok) throw new Error('CARTESIA_REQUEST_FAILED');
        const length = Number(response.headers.get('content-length') || 0);
        if (length > MAX_AUDIO_BYTES) throw new Error('VIDEO_AUDIO_TOO_LARGE');
        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (type && !type.includes('audio/') && type !== 'application/octet-stream')
          throw new Error('INVALID_VIDEO_AUDIO');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 44 || bytes.length > MAX_AUDIO_BYTES ||
            String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF')
          throw new Error('INVALID_VIDEO_AUDIO');
        return { provider: 'cartesia', slot: selected.name, audio: bytes, contentType: 'audio/wav' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

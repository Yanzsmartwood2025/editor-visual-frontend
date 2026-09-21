import { z } from 'zod';
import { getProviderCandidates } from './mediaProviders/registry';
import type { MediaCapability, MediaProviderId } from './mediaProviders/types';

const stockProviderSchema = z.enum(['pexels', 'pixabay', 'openverse']);
const generationProviderSchema = z.enum(['fal', 'replicate', 'tripo', 'meshy']);
const voiceProviderSchema = z.enum(['deepgram', 'cartesia', 'elevenlabs']);
const gpuProviderSchema = z.enum(['runpod', 'vast']);

const urlSchema = z.string().url().max(4000);

const buildTimelineAssetSchema = z.object({
  type: z.enum(['foto', 'image', 'video', 'audio']),
  source: z.literal('url'),
  url: urlSchema,
  durationInSeconds: z.number().min(0.1).max(3600).optional(),
  volume: z.number().min(0).max(2).optional(),
  fadeIn: z.number().min(0).max(30).optional(),
  fadeOut: z.number().min(0).max(30).optional(),
  scale: z.number().min(0.25).max(4).optional(),
  delay: z.number().min(0).max(300).optional(),
  startFrom: z.number().min(0).max(3600).optional(),
  trimBefore: z.number().min(0).max(3600).optional(),
  trimAfter: z.number().min(0).max(3600).optional(),
  loop: z.boolean().optional(),
  playbackRate: z.number().min(0.1).max(4).optional(),
  transitionType: z.enum([
    'fade',
    'wipe',
    'slide',
    'zoom',
    'blur-slide',
    'cross-zoom',
    'dreamy-zoom',
    'film-burn',
    'linear-blur',
    'push-cut',
  ]).optional(),
  transitionDuration: z.number().min(0).max(10).optional(),
  efecto: z.enum([
    'none',
    'grayscale',
    'sepia',
    'vintage',
    'cinematic',
    'blur',
    'glow',
    'high-contrast',
    'soft',
    'ken-burns',
    'pan',
    'rotate',
    'push-in',
    'pull-out',
    'float',
    'tilt-3d',
    'parallax-3d',
  ]).optional(),
  brightness: z.number().min(0.1).max(3).optional(),
  contrast: z.number().min(0.1).max(3).optional(),
  saturation: z.number().min(0).max(4).optional(),
  overlay: z.enum(['none', 'vignette', 'film-grain', 'light-leak', 'letterbox']).optional(),
  overlayIntensity: z.number().min(0).max(1).optional(),
  effects: z.array(z.object({
    type: z.enum([
      'chromatic-aberration',
      'pro-glow',
      'zoom-blur',
      'pixelate',
      'duotone',
      'cinematic-grade',
      'pro-vignette',
    ]),
    intensity: z.number().min(0).max(1).optional().default(0.5),
  })).max(4).optional(),
});

export const naylaActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('BUILD_TIMELINE'),
    assets: z.array(buildTimelineAssetSchema).min(1).max(250),
    subtitles: z.array(z.object({
      text: z.string().trim().min(1).max(1200),
      start: z.number().min(0).max(7200),
      end: z.number().min(0).max(7200),
      style: z.enum(['clean', 'cinematic', 'tiktok', 'karaoke']).optional().default('clean'),
      position: z.enum(['top', 'center', 'bottom']).optional().default('bottom'),
      fontSize: z.number().min(20).max(120).optional(),
    }).refine((item) => item.end > item.start, {
      message: 'El final del subtítulo debe ser posterior al inicio.',
    })).max(300).optional(),
    render: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal('SEARCH_MEDIA'),
    query: z.string().trim().min(1).max(200),
    kind: z.enum(['image', 'video', 'audio']),
    limit: z.number().int().min(1).max(12).optional().default(6),
    providers: z.array(stockProviderSchema).max(3).optional(),
  }),
  z.object({
    action: z.literal('GENERATE_IMAGE'),
    prompt: z.string().trim().min(1).max(3000),
    provider: generationProviderSchema.optional(),
    sourceImageUrl: urlSchema.optional(),
  }),
  z.object({
    action: z.literal('GENERATE_VIDEO'),
    prompt: z.string().trim().min(1).max(3000),
    provider: z.enum(['fal', 'replicate']).optional(),
    sourceImageUrl: urlSchema.optional(),
  }),
  z.object({
    action: z.literal('GENERATE_AUDIO'),
    mode: z.enum([
      'tts',
      'music',
      'sound_effects',
      'speech_to_text',
      'voice_clone',
      'voice_design',
      'voice_change',
      'voice_isolation',
      'dubbing',
      'text_to_dialogue',
      'forced_alignment',
    ]),
    provider: voiceProviderSchema.optional(),
    text: z.string().max(10000).optional(),
    prompt: z.string().max(3000).optional(),
    inputUrl: urlSchema.optional(),
    voiceId: z.string().max(200).optional(),
    targetLanguage: z.string().max(30).optional(),
  }),
  z.object({
    action: z.literal('GENERATE_3D'),
    mode: z.enum([
      'text_to_3d',
      'image_to_3d',
      'multiview_to_3d',
      'texture',
      'optimize',
      'rig',
      'animate',
      'retarget',
    ]),
    provider: z.enum(['tripo', 'meshy', 'fal']).optional(),
    prompt: z.string().max(3000).optional(),
    inputUrl: urlSchema.optional(),
    inputUrls: z.array(urlSchema).max(8).optional(),
  }),
  z.object({
    action: z.literal('RUN_GPU_JOB'),
    provider: gpuProviderSchema.optional(),
    workload: z.enum(['probe', 'image', 'video', 'audio', '3d']).optional(),
    jobType: z.string().trim().min(1).max(100),
    prompt: z.string().max(3000).optional(),
    inputUrls: z.array(urlSchema).max(20).optional(),
    options: z.object({
      duration: z.number().min(10).max(90).optional(),
      instrumental: z.boolean().optional(),
      lyrics: z.string().max(10000).optional(),
    }).strict().optional(),
  }),
]);

export type NaylaAction = z.infer<typeof naylaActionSchema>;

export const parseNaylaAction = (raw: string): NaylaAction | null => {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) return null;

  try {
    const json = JSON.parse(cleaned);
    const parsed = naylaActionSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const capabilityForNaylaAction = (action: NaylaAction): MediaCapability | null => {
  switch (action.action) {
    case 'SEARCH_MEDIA':
      return action.kind === 'image'
        ? 'stock_image'
        : action.kind === 'video'
          ? 'stock_video'
          : 'stock_audio';
    case 'GENERATE_IMAGE':
      return action.sourceImageUrl ? 'image_to_image' : 'image_generation';
    case 'GENERATE_VIDEO':
      return action.sourceImageUrl ? 'image_to_video' : 'video_generation';
    case 'GENERATE_AUDIO': {
      const map: Record<string, MediaCapability> = {
        tts: 'tts',
        music: 'music_generation',
        sound_effects: 'sound_effects',
        speech_to_text: 'speech_to_text',
        voice_clone: 'voice_clone',
        voice_design: 'voice_design',
        voice_change: 'voice_change',
        voice_isolation: 'voice_isolation',
        dubbing: 'dubbing',
        text_to_dialogue: 'text_to_dialogue',
        forced_alignment: 'forced_alignment',
      };
      return map[action.mode];
    }
    case 'GENERATE_3D': {
      const map: Record<string, MediaCapability> = {
        text_to_3d: '3d_generation',
        image_to_3d: '3d_generation',
        multiview_to_3d: '3d_multiview',
        texture: '3d_texturing',
        optimize: '3d_decimation',
        rig: '3d_rigging',
        animate: '3d_animation',
        retarget: '3d_retargeting',
      };
      return map[action.mode] || '3d_generation';
    }
    case 'RUN_GPU_JOB':
      return 'gpu_processing';
    case 'BUILD_TIMELINE':
      return null;
  }
};

export const requestedProviderForAction = (action: NaylaAction): MediaProviderId | undefined => {
  if ('provider' in action && typeof action.provider === 'string') {
    return action.provider as MediaProviderId;
  }
  return undefined;
};

export const getAvailableProvidersForAction = (action: NaylaAction) => {
  const capability = capabilityForNaylaAction(action);
  if (!capability) return [];

  const requested = requestedProviderForAction(action);
  const preferred = getProviderCandidates(capability, requested ? [requested] : undefined);
  if (preferred.length) return preferred;

  return getProviderCandidates(capability);
};

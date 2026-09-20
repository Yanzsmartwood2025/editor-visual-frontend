import type {
  MediaCapability,
  MediaProviderId,
  ProviderDefinition,
  ProviderRuntimeStatus,
} from './types';

export const MEDIA_PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'pexels',
    label: 'Pexels',
    capabilities: ['stock_image', 'stock_video'],
    requiredEnvKeys: ['PEXELS_API_KEY'],
    priority: 10,
    billing: 'free',
    enabledByDefault: true,
    notes: 'Stock de fotos y videos. Requiere atribución/enlace visible en resultados.',
  },
  {
    id: 'pixabay',
    label: 'Pixabay',
    capabilities: ['stock_image', 'stock_video'],
    requiredEnvKeys: ['PIXABAY_API_KEY'],
    priority: 20,
    billing: 'free',
    enabledByDefault: true,
    notes: 'Stock de fotos y videos. No se usa para música porque la API pública documentada no expone audio.',
  },
  {
    id: 'openverse',
    label: 'Openverse',
    capabilities: ['stock_image', 'stock_audio'],
    requiredEnvKeys: [],
    optionalEnvKeys: ['OPENVERSE_CLIENT_ID', 'OPENVERSE_CLIENT_SECRET'],
    priority: 30,
    billing: 'free',
    enabledByDefault: true,
    notes: 'Puede funcionar anónimamente; con OAuth tiene mejor margen de uso. Siempre conservar licencia y atribución.',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    capabilities: ['image_generation', 'video_generation', 'speech_to_text', '3d_generation'],
    requiredEnvKeys: ['FAL_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
  },
  {
    id: 'replicate',
    label: 'Replicate',
    capabilities: ['image_generation', 'video_generation', 'gpu_processing'],
    requiredEnvKeys: ['REPLICATE_API_TOKEN'],
    priority: 20,
    billing: 'usage',
    enabledByDefault: true,
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    capabilities: ['tts', 'speech_to_text'],
    requiredEnvKeys: ['DEEPGRAM_API_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Proveedor económico para narración larga y transcripción.',
  },
  {
    id: 'cartesia',
    label: 'Cartesia',
    capabilities: ['tts', 'voice_clone'],
    requiredEnvKeys: ['CARTESIA_API_KEY'],
    priority: 20,
    billing: 'usage',
    enabledByDefault: true,
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    capabilities: ['tts', 'voice_clone', 'music_generation', 'sound_effects', 'speech_to_text'],
    requiredEnvKeys: ['ELEVENLABS_API_KEY'],
    priority: 30,
    billing: 'mixed',
    enabledByDefault: true,
  },
  {
    id: 'runpod',
    label: 'RunPod',
    capabilities: ['gpu_processing'],
    requiredEnvKeys: ['RUNPOD_API_KEY'],
    optionalEnvKeys: ['RUNPOD_ENDPOINT_ID'],
    priority: 10,
    billing: 'infrastructure',
    enabledByDefault: true,
  },
  {
    id: 'vast',
    label: 'Vast.ai',
    capabilities: ['gpu_processing'],
    requiredEnvKeys: ['VAST_API_KEY'],
    optionalEnvKeys: ['VAST_WORKERGROUP_ID'],
    priority: 20,
    billing: 'infrastructure',
    enabledByDefault: true,
  },
  {
    id: 'tripo',
    label: 'Tripo',
    capabilities: ['3d_generation'],
    requiredEnvKeys: ['TRIPO_API_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
  },
  {
    id: 'meshy',
    label: 'Meshy',
    capabilities: ['3d_generation', '3d_rigging', '3d_animation'],
    requiredEnvKeys: ['MESHY_API_KEY'],
    priority: 20,
    billing: 'mixed',
    enabledByDefault: false,
    notes: 'Se mantiene como proveedor premium/opcional hasta decidir el plan de API.',
  },
];

const hasEnvValue = (key: string) => Boolean(process.env[key]?.trim());

export const getProviderDefinition = (id: MediaProviderId): ProviderDefinition | undefined =>
  MEDIA_PROVIDER_REGISTRY.find((provider) => provider.id === id);

export const isProviderConfigured = (provider: ProviderDefinition): boolean =>
  provider.requiredEnvKeys.every(hasEnvValue);

export const getProviderRuntimeStatus = (provider: ProviderDefinition): ProviderRuntimeStatus => {
  const configured = isProviderConfigured(provider);
  const optionalKeys = provider.optionalEnvKeys || [];
  const hasCompleteOptionalCredentials =
    optionalKeys.length > 0 && optionalKeys.every(hasEnvValue);

  return {
    id: provider.id,
    label: provider.label,
    configured,
    mode: configured
      ? provider.requiredEnvKeys.length === 0 && !hasCompleteOptionalCredentials
        ? 'anonymous'
        : 'authenticated'
      : 'unconfigured',
    capabilities: provider.capabilities,
    priority: provider.priority,
  };
};

export const getAllProviderRuntimeStatuses = (): ProviderRuntimeStatus[] =>
  MEDIA_PROVIDER_REGISTRY.map(getProviderRuntimeStatus);

export const getProviderCandidates = (
  capability: MediaCapability,
  requested?: MediaProviderId[]
): ProviderDefinition[] =>
  MEDIA_PROVIDER_REGISTRY
    .filter((provider) => provider.enabledByDefault)
    .filter((provider) => provider.capabilities.includes(capability))
    .filter((provider) => !requested?.length || requested.includes(provider.id))
    .filter(isProviderConfigured)
    .sort((a, b) => a.priority - b.priority);

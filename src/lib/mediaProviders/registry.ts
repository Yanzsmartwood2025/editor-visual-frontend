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
    notes: 'Stock de fotos y videos.',
  },
  {
    id: 'pixabay',
    label: 'Pixabay',
    capabilities: ['stock_image', 'stock_video'],
    requiredEnvKeys: ['PIXABAY_API_KEY'],
    priority: 20,
    billing: 'free',
    enabledByDefault: true,
    notes: 'Stock de fotos y videos. No se asume un endpoint de audio no documentado.',
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
    notes: 'Puede funcionar anónimamente; conservar licencia y atribución de cada recurso.',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    capabilities: [
      'image_generation',
      'image_editing',
      'video_generation',
      'image_to_video',
      'audio_generation',
      'speech_to_text',
      '3d_generation',
      'custom_model_inference',
    ],
    requiredEnvKeys: ['FAL_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Catálogo amplio de modelos generativos; la capacidad concreta depende del modelo elegido.',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    capabilities: [
      'image_generation',
      'image_editing',
      'video_generation',
      'gpu_processing',
      'custom_model_inference',
    ],
    requiredEnvKeys: ['REPLICATE_API_TOKEN'],
    priority: 20,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Marketplace/ejecución de modelos. La capacidad exacta depende del modelo seleccionado.',
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    capabilities: ['tts', 'speech_to_text', 'voice_agent'],
    requiredEnvKeys: ['DEEPGRAM_API_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Voz y transcripción; también ofrece Voice Agent en tiempo real.',
  },
  {
    id: 'cartesia',
    label: 'Cartesia',
    capabilities: ['tts', 'speech_to_text', 'voice_clone', 'voice_change', 'dubbing', 'voice_agent'],
    requiredEnvKeys: ['CARTESIA_API_KEY'],
    priority: 20,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Sonic/Ink para voz y transcripción; clonación, cambio de voz, doblaje y agentes.',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    capabilities: [
      'tts',
      'speech_to_text',
      'voice_clone',
      'voice_design',
      'voice_change',
      'voice_isolation',
      'dubbing',
      'text_to_dialogue',
      'music_generation',
      'sound_effects',
      'forced_alignment',
      'pronunciation_dictionary',
      'voice_agent',
    ],
    requiredEnvKeys: ['ELEVENLABS_API_KEY'],
    priority: 30,
    billing: 'mixed',
    enabledByDefault: true,
    notes: 'Suite de audio amplia; algunas capacidades y voces dependen del plan.',
  },
  {
    id: 'runpod',
    label: 'RunPod',
    capabilities: ['gpu_processing', 'custom_model_inference'],
    requiredEnvKeys: ['RUNPOD_API_KEY'],
    optionalEnvKeys: ['RUNPOD_ENDPOINT_ID'],
    priority: 10,
    billing: 'infrastructure',
    enabledByDefault: true,
  },
  {
    id: 'vast',
    label: 'Vast.ai',
    capabilities: ['gpu_processing', 'custom_model_inference'],
    requiredEnvKeys: ['VAST_API_KEY'],
    optionalEnvKeys: ['VAST_WORKERGROUP_ID'],
    priority: 20,
    billing: 'infrastructure',
    enabledByDefault: true,
  },
  {
    id: 'tripo',
    label: 'Tripo',
    capabilities: [
      'image_generation',
      'image_to_image',
      '3d_generation',
      '3d_multiview',
      '3d_texturing',
      '3d_conversion',
      '3d_segmentation',
      '3d_mesh_completion',
      '3d_decimation',
      '3d_rig_check',
      '3d_rigging',
      '3d_retargeting',
    ],
    requiredEnvKeys: ['TRIPO_API_KEY'],
    priority: 10,
    billing: 'usage',
    enabledByDefault: true,
    notes: 'Flujo 3D completo desde generación hasta optimización y rigging.',
  },
  {
    id: 'meshy',
    label: 'Meshy',
    capabilities: [
      '3d_generation',
      '3d_multiview',
      '3d_texturing',
      '3d_decimation',
      '3d_rigging',
      '3d_animation',
    ],
    requiredEnvKeys: ['MESHY_API_KEY'],
    priority: 20,
    billing: 'mixed',
    enabledByDefault: true,
    notes: 'Proveedor 3D premium/opcional; queda disponible cuando MESHY_API_KEY esté configurada.',
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

export const getConfiguredProviderSummary = () =>
  MEDIA_PROVIDER_REGISTRY.map(getProviderRuntimeStatus).map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.configured,
    mode: provider.mode,
    capabilities: provider.capabilities,
  }));

export type MediaCapability =
  | 'stock_image'
  | 'stock_video'
  | 'stock_audio'
  | 'image_generation'
  | 'image_editing'
  | 'image_to_image'
  | 'video_generation'
  | 'image_to_video'
  | 'audio_generation'
  | 'tts'
  | 'speech_to_text'
  | 'voice_clone'
  | 'voice_design'
  | 'voice_change'
  | 'voice_isolation'
  | 'dubbing'
  | 'text_to_dialogue'
  | 'music_generation'
  | 'sound_effects'
  | 'forced_alignment'
  | 'pronunciation_dictionary'
  | 'voice_agent'
  | 'gpu_processing'
  | 'custom_model_inference'
  | '3d_generation'
  | '3d_multiview'
  | '3d_texturing'
  | '3d_conversion'
  | '3d_segmentation'
  | '3d_mesh_completion'
  | '3d_decimation'
  | '3d_rig_check'
  | '3d_rigging'
  | '3d_animation'
  | '3d_retargeting';

export type MediaProviderId =
  | 'pexels'
  | 'pixabay'
  | 'openverse'
  | 'fal'
  | 'replicate'
  | 'deepgram'
  | 'cartesia'
  | 'elevenlabs'
  | 'runpod'
  | 'vast'
  | 'tripo'
  | 'meshy';

export type ProviderBillingModel =
  | 'free'
  | 'usage'
  | 'subscription'
  | 'infrastructure'
  | 'mixed';

export type CapabilityUiGroup =
  | 'search'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'agents'
  | '3d'
  | 'gpu';

export type CapabilityDefinition = {
  id: MediaCapability;
  label: string;
  group: CapabilityUiGroup;
  description: string;
  iconKey: string;
  billable: boolean;
  requiresConsent?: boolean;
};

export type ProviderDefinition = {
  id: MediaProviderId;
  label: string;
  capabilities: MediaCapability[];
  requiredEnvKeys: string[];
  optionalEnvKeys?: string[];
  priority: number;
  billing: ProviderBillingModel;
  enabledByDefault: boolean;
  notes?: string;
};

export type ProviderRuntimeStatus = {
  id: MediaProviderId;
  label: string;
  configured: boolean;
  mode: 'authenticated' | 'anonymous' | 'unconfigured';
  capabilities: MediaCapability[];
  priority: number;
};

export type StockMediaKind = 'image' | 'video' | 'audio';

export type StockMediaResult = {
  id: string;
  provider: Extract<MediaProviderId, 'pexels' | 'pixabay' | 'openverse'>;
  kind: StockMediaKind;
  title: string;
  sourceUrl: string;
  previewUrl?: string;
  mediaUrl?: string;
  creator?: string;
  creatorUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  licenseName: string;
  licenseUrl?: string;
  attribution?: string;
  metadata?: Record<string, unknown>;
};

export type StockSearchRequest = {
  query: string;
  kind: StockMediaKind;
  limit?: number;
  providers?: Array<Extract<MediaProviderId, 'pexels' | 'pixabay' | 'openverse'>>;
};

export type StockSearchResponse = {
  results: StockMediaResult[];
  providersTried: string[];
  errors: Array<{ provider: string; message: string }>;
};

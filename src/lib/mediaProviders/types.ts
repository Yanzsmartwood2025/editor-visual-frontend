export type MediaCapability =
  | 'stock_image'
  | 'stock_video'
  | 'stock_audio'
  | 'image_generation'
  | 'video_generation'
  | 'tts'
  | 'voice_clone'
  | 'music_generation'
  | 'sound_effects'
  | 'speech_to_text'
  | 'gpu_processing'
  | '3d_generation'
  | '3d_rigging'
  | '3d_animation';

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

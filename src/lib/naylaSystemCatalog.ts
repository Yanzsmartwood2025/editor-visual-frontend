import { getProviderCandidates } from './mediaProviders/registry';
import type { MediaCapability } from './mediaProviders/types';

export type NaylaEngineMode = 'auto' | 'cloud' | 'compute';
export type NaylaCloudDomain = 'image' | 'video' | 'audio' | '3d';

const optionalMoney = (key: string): number | null => {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10000) / 10000;
};

const boundedNumber = (
  key: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = process.env[key]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const hasConfiguredCapability = (capabilities: MediaCapability[]) =>
  capabilities.some((capability) => getProviderCandidates(capability).length > 0);

const CLOUD_DOMAINS: Array<{
  id: NaylaCloudDomain;
  label: string;
  description: string;
  capabilities: MediaCapability[];
  priceEnv: string;
  priceUnit: string;
}> = [
  {
    id: 'image',
    label: 'Imágenes',
    description: 'Generación y edición visual.',
    capabilities: ['image_generation', 'image_editing', 'image_to_image'],
    priceEnv: 'NAYLA_CLOUD_IMAGE_PRICE_USD',
    priceUnit: 'por trabajo',
  },
  {
    id: 'video',
    label: 'Videos',
    description: 'Generación de video e imagen a video.',
    capabilities: ['video_generation', 'image_to_video'],
    priceEnv: 'NAYLA_CLOUD_VIDEO_PRICE_USD',
    priceUnit: 'por trabajo',
  },
  {
    id: 'audio',
    label: 'Audio / voz',
    description: 'Voz, música, sonido, transcripción y doblaje.',
    capabilities: [
      'tts',
      'music_generation',
      'sound_effects',
      'speech_to_text',
      'voice_clone',
      'voice_design',
      'voice_change',
      'voice_isolation',
      'dubbing',
      'text_to_dialogue',
      'forced_alignment',
    ],
    priceEnv: 'NAYLA_CLOUD_AUDIO_PRICE_USD',
    priceUnit: 'desde / trabajo',
  },
  {
    id: '3d',
    label: '3D',
    description: 'Generación, texturizado, optimización y rig.',
    capabilities: [
      '3d_generation',
      '3d_multiview',
      '3d_texturing',
      '3d_decimation',
      '3d_rigging',
      '3d_animation',
      '3d_retargeting',
    ],
    priceEnv: 'NAYLA_CLOUD_3D_PRICE_USD',
    priceUnit: 'por trabajo',
  },
];

export const getNaylaCloudCatalog = () =>
  CLOUD_DOMAINS.map((domain) => {
    const priceUsd = optionalMoney(domain.priceEnv);
    return {
      id: domain.id,
      label: domain.label,
      description: domain.description,
      configured: hasConfiguredCapability(domain.capabilities),
      price: priceUsd === null
        ? {
            status: 'pending' as const,
            amountUsd: null,
            unit: domain.priceUnit,
            label: 'Precio por definir',
          }
        : {
            status: 'configured' as const,
            amountUsd: priceUsd,
            unit: domain.priceUnit,
            label: '$' + priceUsd.toFixed(2) + ' ' + domain.priceUnit,
          },
    };
  });

export const getNaylaComputePricingPolicy = () => ({
  // Hasta conectar pagos, esto es una capa comercial de presentación.
  // El costo real del proveedor nunca se devuelve al cliente.
  multiplier: boundedNumber('NAYLA_COMPUTE_PRICE_MULTIPLIER', 1, 1, 10),
  fixedHourlyUsd: boundedNumber('NAYLA_COMPUTE_FIXED_HOURLY_USD', 0, 0, 100),
});

export const toNaylaComputeHourlyPrice = (internalHourlyUsd: number): number => {
  const { multiplier, fixedHourlyUsd } = getNaylaComputePricingPolicy();
  const raw = internalHourlyUsd * multiplier + fixedHourlyUsd;
  return Math.ceil(raw * 1000) / 1000;
};

export const toNaylaComputeEstimatedPrice = (
  internalEstimatedUsd: number,
  estimatedRuntimeMinutes = 0
): number => {
  const { multiplier, fixedHourlyUsd } = getNaylaComputePricingPolicy();
  const fixedPart = fixedHourlyUsd * (Math.max(0, estimatedRuntimeMinutes) / 60);
  return Math.ceil((internalEstimatedUsd * multiplier + fixedPart) * 1000) / 1000;
};

export const getNaylaPublicSystemCatalog = () => ({
  brand: {
    cloud: 'Nayla Cloud',
    compute: 'Nayla Compute',
    energy: 'Nayla Energy',
  },
  cloud: getNaylaCloudCatalog(),
  compute: {
    label: 'Nayla Compute',
    description: 'GPU bajo demanda para procesos intensivos.',
    pricingStatus: 'preview' as const,
  },
  energy: {
    label: 'Nayla Energy',
    enabled: false,
    balanceUsd: null,
    status: 'coming_soon' as const,
    message: 'Recargas y saldo estarán disponibles cuando se active el sistema de pagos.',
  },
});

const UPSTREAM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/vast\.ai/gi, 'Nayla Compute'],
  [/\bvast\b/gi, 'Nayla Compute'],
  [/\brunpod\b/gi, 'Nayla Compute'],
  [/\bfal\.ai\b/gi, 'Nayla Cloud'],
  [/\bfal\b/gi, 'Nayla Cloud'],
  [/\breplicate\b/gi, 'Nayla Cloud'],
  [/\bdeepgram\b/gi, 'Nayla Cloud'],
  [/\bcartesia\b/gi, 'Nayla Cloud'],
  [/\belevenlabs\b/gi, 'Nayla Cloud'],
  [/\btripo\b/gi, 'Nayla Cloud'],
  [/\bmeshy\b/gi, 'Nayla Cloud'],
  [/\bpexels\b/gi, 'biblioteca de stock'],
  [/\bpixabay\b/gi, 'biblioteca de stock'],
  [/\bopenverse\b/gi, 'biblioteca de stock'],
  [/\bace-step\b/gi, 'motor musical de Nayla Compute'],
  [/\btriposr\b/gi, 'motor 3D de Nayla Compute'],
];

export const sanitizeNaylaPublicText = (value: string): string =>
  UPSTREAM_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );

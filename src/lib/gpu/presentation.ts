import type { ComputeSelectionTarget } from './selection';

export type ComputeCardTone = 'recommended' | 'alternative' | 'unavailable';

export const getComputeCardTone = ({
  available,
  recommended,
}: {
  available: boolean;
  recommended: boolean;
}): ComputeCardTone => {
  if (!available) return 'unavailable';
  return recommended ? 'recommended' : 'alternative';
};

export const getComputeProviderLabel = (
  provider: ComputeSelectionTarget['backend']
): string => {
  const labels: Record<ComputeSelectionTarget['backend'], string> = {
    vast: 'Vast.ai',
    runpod: 'RunPod',
    vultr: 'Vultr',
  };
  return labels[provider];
};

export const getComputeOfferChangedMessage = (providerName?: string): string =>
  providerName
    ? `La oferta de ${providerName} cambió o dejó de estar disponible. Elige otra de la lista actualizada.`
    : 'La tarjeta elegida cambió o dejó de estar disponible. Elige otra de la lista actualizada.';

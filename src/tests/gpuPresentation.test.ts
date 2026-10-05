import { describe, expect, it } from 'vitest';
import {
  getComputeCardTone,
  getComputeOfferChangedMessage,
  getComputeProviderLabel,
} from '../lib/gpu/presentation';

describe('GPU quote card presentation', () => {
  it('uses green recommendation, amber alternative, and gray unavailable tones', () => {
    expect(getComputeCardTone({ available: true, recommended: true })).toBe('recommended');
    expect(getComputeCardTone({ available: true, recommended: false })).toBe('alternative');
    expect(getComputeCardTone({ available: false, recommended: false })).toBe('unavailable');
    expect(getComputeCardTone({ available: false, recommended: true })).toBe('unavailable');
  });

  it('shows the actual provider name on each GPU card', () => {
    expect(getComputeProviderLabel('vast')).toBe('Vast.ai');
    expect(getComputeProviderLabel('runpod')).toBe('RunPod');
    expect(getComputeProviderLabel('vultr')).toBe('Vultr');
  });

  it('identifies the provider when a selected offer has changed', () => {
    expect(getComputeOfferChangedMessage('RunPod')).toBe(
      'La oferta de RunPod cambió o dejó de estar disponible. Elige otra de la lista actualizada.',
    );
    expect(getComputeOfferChangedMessage()).toBe(
      'La tarjeta elegida cambió o dejó de estar disponible. Elige otra de la lista actualizada.',
    );
  });
});

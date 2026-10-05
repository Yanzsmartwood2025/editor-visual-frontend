import { describe, expect, it } from 'vitest';
import {
  getComputeCardTone,
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
});

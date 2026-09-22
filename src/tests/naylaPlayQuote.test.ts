import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/gpu/computeCatalog', () => ({
  getComputeCatalog: vi.fn(),
}));

import { getComputeCatalog } from '../lib/gpu/computeCatalog';
import {
  getNaylaPlayMarginUsd,
  getNaylaPlayProfile,
  quoteNaylaPlay,
} from '../lib/play/quote';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.VAST_API_KEY = 'a';
  process.env.RUNPOD_API_KEY = 'b';
  process.env.VULTR_API_KEY = 'c';
  process.env.NAYLA_PLAY_MARGIN_USD = '0.35';
  process.env.VAST_MIN_BALANCE_USD = '0';
  process.env.VAST_MIN_RELIABILITY = '0.95';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe('Nayla Play quote', () => {
  it('uses a gaming-oriented discovery profile', () => {
    const profile = getNaylaPlayProfile();
    expect(profile.minGpuRamGb).toBe(16);
    expect(profile.diskGb).toBe(100);
    expect(profile.maxRuntimeMinutes).toBe(60);
  });

  it('adds Nayla margin without exposing provider cost or provider identity', async () => {
    vi.mocked(getComputeCatalog).mockResolvedValue({
      candidates: [
        {
          backend: 'vast',
          backendId: '123',
          gpuName: 'GPU B',
          gpuRamGb: 16,
          hourlyPrice: 0.4,
          balanceUsd: 10,
          raw: { geolocation: 'US' },
        },
        {
          backend: 'vultr',
          backendId: 'plan@ewr',
          gpuName: 'RTX Test',
          gpuRamGb: 24,
          hourlyPrice: 0.5,
          balanceUsd: 10,
          raw: {},
          regionLabel: 'New Jersey, US',
          billingMinimumMinutes: 60,
        },
      ],
      errors: [],
    } as any);

    const quote = await quoteNaylaPlay();

    expect(quote.networksConfigured).toBe(3);
    expect(quote.networksReachable).toBe(2);
    expect(quote.cards).toHaveLength(2);
    expect(quote.cards[0].hourlyPrice).toBe(0.75);
    expect(quote.cards[1].hourlyPrice).toBe(0.85);
    expect(quote.cards[1].region).toBe('New Jersey, US');
    expect(getNaylaPlayMarginUsd()).toBe(0.35);

    const serialized = JSON.stringify(quote);
    expect(serialized).not.toContain('vultr');
    expect(serialized).not.toContain('vast');
    expect(serialized).not.toContain('internalHourlyPrice');
  });
});

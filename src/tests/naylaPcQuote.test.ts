import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/gpu/vultrApi', () => ({
  isVultrConfigured: vi.fn(),
  listVultrPlans: vi.fn(),
  listVultrRegions: vi.fn(),
  listVultrOperatingSystems: vi.fn(),
  getVultrGpuVramGb: vi.fn((plan: any) => plan.gpu_vram_gb),
}));

import {
  isVultrConfigured,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
} from '../lib/gpu/vultrApi';
import { normalizeNaylaPcRequest, quoteNaylaPc } from '../lib/pc/quote';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.VAST_API_KEY = 'network-a';
  process.env.RUNPOD_API_KEY = 'network-b';
  process.env.VULTR_API_KEY = 'network-c';
  process.env.NAYLA_COMPUTE_SELECTION_SECRET = 'selection-secret';
  process.env.NAYLA_PC_PRICE_MULTIPLIER = '1';
  process.env.NAYLA_PC_FIXED_HOURLY_USD = '0';

  vi.mocked(isVultrConfigured).mockReturnValue(true);
  vi.mocked(listVultrRegions).mockResolvedValue([
    { id: 'ewr', city: 'New Jersey', country: 'US' },
  ] as any);
  vi.mocked(listVultrOperatingSystems).mockResolvedValue([
    { id: 1, name: 'Ubuntu 24.04 x64', family: 'ubuntu', arch: 'x64' },
    { id: 2, name: 'Windows Server 2025 x64', family: 'windows', arch: 'x64' },
  ] as any);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe('Nayla PC quote', () => {
  it('normalizes slider inputs defensively', () => {
    expect(normalizeNaylaPcRequest({
      cpu: 999,
      ramGb: -3,
      diskGb: 83,
      durationHours: 0,
    })).toMatchObject({
      cpu: 64,
      ramGb: 1,
      diskGb: 85,
      durationHours: 1,
      osFamily: 'linux',
      billingMode: 'hourly',
    });
  });

  it('filters live plans by CPU, RAM, disk and optional GPU without exposing the provider', async () => {
    vi.mocked(listVultrPlans).mockResolvedValue([
      {
        id: 'cpu-small',
        type: 'vc2',
        vcpu_count: 2,
        ram: 4096,
        disk: 80,
        monthly_cost: 24,
        locations: ['ewr'],
      },
      {
        id: 'cpu-right',
        type: 'vc2',
        vcpu_count: 4,
        ram: 8192,
        disk: 160,
        monthly_cost: 48,
        locations: ['ewr'],
      },
      {
        id: 'gpu-right',
        type: 'vcg',
        vcpu_count: 8,
        ram: 32768,
        disk: 240,
        monthly_cost: 365,
        gpu_type: 'NVIDIA Test',
        gpu_vram_gb: 24,
        locations: ['ewr'],
      },
    ] as any);

    const quote = await quoteNaylaPc({
      cpu: 4,
      ramGb: 8,
      diskGb: 100,
      gpuEnabled: false,
      billingMode: 'hourly',
      durationHours: 2,
      osFamily: 'linux',
    });

    expect(quote.networksConfigured).toBe(3);
    expect(quote.networksEligible).toBe(1);
    expect(quote.cards).toHaveLength(1);
    expect(quote.cards[0]).toMatchObject({
      cpu: 4,
      ramGb: 8,
      diskGb: 160,
      region: 'New Jersey, US',
      monthlyPrice: 48,
      recommended: true,
    });
    expect(quote.cards[0].hourlyPrice).toBeCloseTo(48 / 672, 3);
    expect(quote.cards[0].estimatedSessionPrice).toBeCloseTo((48 / 672) * 2, 3);

    const serialized = JSON.stringify(quote);
    expect(serialized).not.toContain('vultr');
    expect(serialized).not.toContain('cpu-right');
    expect(serialized).not.toContain('network-c');
  });

  it('uses the GPU billing cap and flags Windows licensing as incomplete', async () => {
    vi.mocked(listVultrPlans).mockResolvedValue([
      {
        id: 'gpu-right',
        type: 'vcg',
        vcpu_count: 8,
        ram: 32768,
        disk: 240,
        monthly_cost: 365,
        gpu_type: 'NVIDIA Test',
        gpu_vram_gb: 24,
        locations: ['ewr'],
      },
    ] as any);

    const quote = await quoteNaylaPc({
      cpu: 4,
      ramGb: 8,
      diskGb: 100,
      gpuEnabled: true,
      minGpuVramGb: 16,
      billingMode: 'monthly',
      osFamily: 'windows',
    });

    expect(quote.cards).toHaveLength(1);
    expect(quote.cards[0].billingCapHours).toBe(730);
    expect(quote.cards[0].hourlyPrice).toBe(0.5);
    expect(quote.cards[0].monthlyPrice).toBe(365);
    expect(quote.os.windows.available).toBe(true);
    expect(quote.os.windows.licenseIncluded).toBe(false);
    expect(quote.pricing.complete).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildVultrWorkerUserData,
  createVultrGpuInstance,
  deleteVultrInstance,
  getVultrAccountSummary,
  getVultrInstance,
  parseVultrCandidateId,
  searchVultrGpuPlans,
} from '../lib/gpu/vultrApi';
import { getGpuProfile } from '../lib/gpu/profiles';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Vultr Compute adapter', () => {
  it('reads raw Vultr billing balance without treating it as spendable credit', async () => {
    process.env.VULTR_API_KEY = 'vultr-secret';

    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer vultr-secret');
      return new Response(JSON.stringify({
        account: {
          balance: 12.5,
          pending_charges: 1.25,
          api_key: 'must-not-escape',
        },
      }), { status: 200 });
    }));

    const account = await getVultrAccountSummary();
    expect(account.balance).toBe(12.5);
    expect(account.rawBalance).toBe(12.5);
    expect(account.pendingCharges).toBe(1.25);
    expect(JSON.stringify(account)).not.toContain('vultr-secret');
    expect(JSON.stringify(account)).not.toContain('must-not-escape');
  });

  it('expands compatible GPU plans into region-specific live candidates', async () => {
    process.env.VULTR_API_KEY = 'vultr-secret';

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/plans?')) {
        return new Response(JSON.stringify({
          plans: [
            {
              id: 'vcg-a40-test',
              type: 'vcg',
              gpu_type: 'NVIDIA A40',
              gpu_vram_gb: 48,
              monthly_cost: 365,
              disk: 120,
              bandwidth: 2048,
              link_speed: 10000,
              locations: ['ewr', 'lax'],
            },
            {
              id: 'vcg-small',
              type: 'vcg',
              gpu_type: 'Small GPU',
              gpu_vram_gb: 8,
              monthly_cost: 100,
              locations: ['ewr'],
            },
          ],
        }), { status: 200 });
      }

      return new Response(JSON.stringify({
        regions: [
          { id: 'ewr', city: 'New Jersey', country: 'US' },
          { id: 'lax', city: 'Los Angeles', country: 'US' },
        ],
      }), { status: 200 });
    }));

    const profile = getGpuProfile('video');
    const candidates = await searchVultrGpuPlans(profile);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].plan.id).toBe('vcg-a40-test');
    expect(candidates[0].hourlyPrice).toBeCloseTo(0.5, 8);
    expect(candidates.map((item) => item.region.id)).toEqual(['ewr', 'lax']);
  });

  it('builds GPU-enabled cloud-init userdata for the shared Nayla worker contract', () => {
    const encoded = buildVultrWorkerUserData({
      imageName: 'worker:test',
      onstart: 'echo hello',
      env: {
        NAYLA_GPU_JOB_ID: 'job-id',
        NAYLA_GPU_CALLBACK_TOKEN: 'callback-token',
      },
    });

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    expect(decoded).toContain('docker pull');
    expect(decoded).toContain('docker run --rm --gpus all');
    expect(decoded).toContain('worker:test');
    expect(decoded).toContain('NAYLA_GPU_JOB_ID=job-id');
    expect(decoded).toContain('NAYLA_GPU_CALLBACK_TOKEN=callback-token');
    expect(decoded).toContain('base64 -d | bash');
  });

  it('creates, reads and destroys a Vultr GPU instance with cloud-init', async () => {
    process.env.VULTR_API_KEY = 'vultr-secret';
    process.env.VULTR_GPU_OS_ID = '1743';
    const calls: Array<{ url: string; method?: string; body?: any }> = [];

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = {
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);

      if (call.method === 'POST') {
        return new Response(JSON.stringify({
          instance: {
            id: 'instance-uuid',
            status: 'pending',
            region: 'ewr',
            plan: 'vcg-a40-test',
          },
        }), { status: 202 });
      }

      if (call.method === 'GET') {
        return new Response(JSON.stringify({
          instance: {
            id: 'instance-uuid',
            status: 'active',
            power_status: 'running',
            server_status: 'ok',
          },
        }), { status: 200 });
      }

      return new Response(null, { status: 204 });
    }));

    const created = await createVultrGpuInstance({
      planId: 'vcg-a40-test',
      regionId: 'ewr',
      label: 'nayla-gpu-test',
      userData: 'BASE64',
    });

    expect(created.id).toBe('instance-uuid');
    expect(calls[0].body).toMatchObject({
      region: 'ewr',
      plan: 'vcg-a40-test',
      os_id: 1743,
      user_data: 'BASE64',
      activation_email: false,
    });

    const instance = await getVultrInstance('instance-uuid');
    expect(instance?.power_status).toBe('running');

    await deleteVultrInstance('instance-uuid');
    expect(calls[2].method).toBe('DELETE');
  });

  it('parses opaque Vultr plan and region targets', () => {
    expect(parseVultrCandidateId('vcg-a40-test@ewr')).toEqual({
      planId: 'vcg-a40-test',
      regionId: 'ewr',
    });
    expect(parseVultrCandidateId('broken')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRunpodPod,
  getRunpodAccountSummary,
  getRunpodPod,
  searchRunpodGpuTypes,
  terminateRunpodPod,
} from '../lib/gpu/runpodApi';
import { getGpuProfile } from '../lib/gpu/profiles';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RunPod Compute adapter', () => {
  it('reads spendable balance without exposing API secrets', async () => {
    process.env.RUNPOD_API_KEY = 'runpod-secret';
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer runpod-secret');
      return new Response(JSON.stringify({
        data: {
          myself: {
            clientBalance: 9.25,
            minBalance: 0,
            underBalance: false,
            currentSpendPerHr: 0.1,
            spendLimit: 20,
          },
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const account = await getRunpodAccountSummary();
    expect(account.balance).toBe(9.25);
    expect(JSON.stringify(account)).not.toContain('runpod-secret');
  });

  it('returns every compatible in-stock GPU type sorted by current on-demand price', async () => {
    process.env.RUNPOD_API_KEY = 'runpod-secret';
    let receivedBody: any;

    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      receivedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        data: {
          gpuTypes: [
            {
              id: 'NVIDIA A100 80GB PCIe',
              displayName: 'A100 PCIe',
              memoryInGb: 80,
              lowestPrice: {
                gpuTypeId: 'NVIDIA A100 80GB PCIe',
                gpuName: 'A100 PCIe',
                uninterruptablePrice: 0.59,
                stockStatus: 'Available',
                availableGpuCounts: [1, 2],
              },
            },
            {
              id: 'NVIDIA GeForce RTX 4090',
              displayName: 'RTX 4090',
              memoryInGb: 24,
              lowestPrice: {
                gpuTypeId: 'NVIDIA GeForce RTX 4090',
                gpuName: 'RTX 4090',
                uninterruptablePrice: 0.34,
                stockStatus: 'Available',
                availableGpuCounts: [1],
              },
            },
            {
              id: 'NVIDIA RTX A4000',
              displayName: 'RTX A4000',
              memoryInGb: 16,
              lowestPrice: {
                gpuTypeId: 'NVIDIA RTX A4000',
                gpuName: 'RTX A4000',
                uninterruptablePrice: 0.18,
                stockStatus: 'Available',
                availableGpuCounts: [1],
              },
            },
            {
              id: 'OUT',
              displayName: 'Out of stock GPU',
              memoryInGb: 48,
              lowestPrice: {
                gpuTypeId: 'OUT',
                gpuName: 'Out',
                uninterruptablePrice: 0.1,
                stockStatus: 'Out of stock',
                availableGpuCounts: [],
                maxUnreservedGpuCount: 0,
              },
            },
          ],
        },
      }), { status: 200 });
    }));

    const profile = getGpuProfile('video');
    const cards = await searchRunpodGpuTypes(profile);

    expect(receivedBody.variables.priceInput).toEqual({
      gpuCount: 1,
      minDisk: profile.diskGb,
    });
    expect(cards.map((gpu) => gpu.id)).toEqual([
      'NVIDIA GeForce RTX 4090',
      'NVIDIA A100 80GB PCIe',
    ]);
  });

  it('creates an ephemeral Pod with the exact GPU type and shutdown deadline', async () => {
    process.env.RUNPOD_API_KEY = 'runpod-secret';
    let receivedBody: any;

    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      receivedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        data: {
          podFindAndDeployOnDemand: {
            id: 'pod_123',
            costPerHr: 0.34,
            desiredStatus: 'RUNNING',
            imageName: 'worker:image',
            gpuCount: 1,
            memoryInGb: 24,
            lastStatusChange: 'now',
          },
        },
      }), { status: 200 });
    }));

    const deadline = new Date('2026-09-20T22:00:00.000Z');
    const pod = await createRunpodPod({
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      imageName: 'worker:image',
      diskGb: 35,
      name: 'nayla-test',
      onstart: 'echo hello',
      env: {
        NAYLA_GPU_JOB_ID: 'job-id',
        NAYLA_GPU_CALLBACK_TOKEN: 'callback-secret',
      },
      terminateAfter: deadline,
    });

    expect(pod.id).toBe('pod_123');
    const input = receivedBody.variables.input;
    expect(input.gpuTypeId).toBe('NVIDIA GeForce RTX 4090');
    expect(input.gpuCount).toBe(1);
    expect(input.imageName).toBe('worker:image');
    expect(input.containerDiskInGb).toBe(35);
    expect(input.terminateAfter).toBe(deadline.toISOString());
    expect(input.dockerArgs).toContain('bash -lc');
    expect(input.env).toEqual(expect.arrayContaining([
      { key: 'NAYLA_GPU_JOB_ID', value: 'job-id' },
      { key: 'NAYLA_GPU_CALLBACK_TOKEN', value: 'callback-secret' },
    ]));
    expect(JSON.stringify(pod)).not.toContain('callback-secret');
  });

  it('reads and terminates a Pod through opaque server-side IDs', async () => {
    process.env.RUNPOD_API_KEY = 'runpod-secret';
    const bodies: any[] = [];

    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (String(body.query).includes('query NaylaRunpodPod')) {
        return new Response(JSON.stringify({
          data: {
            pod: {
              id: 'pod_123',
              desiredStatus: 'RUNNING',
              costPerHr: 0.34,
            },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { podTerminate: null },
      }), { status: 200 });
    }));

    const pod = await getRunpodPod('pod_123');
    expect(pod?.desiredStatus).toBe('RUNNING');

    await terminateRunpodPod('pod_123');
    expect(bodies[0].variables.input).toEqual({ podId: 'pod_123' });
    expect(bodies[1].variables.input).toEqual({ podId: 'pod_123' });
  });
});

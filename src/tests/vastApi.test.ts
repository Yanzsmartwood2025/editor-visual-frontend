import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVastInstance,
  destroyVastInstance,
  getVastAccountSummary,
  searchVastOffers,
} from '../lib/gpu/vastApi';
import { getGpuProfile } from '../lib/gpu/profiles';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Vast API adapter', () => {
  it('reads balance without returning account secrets', async () => {
    process.env.VAST_API_KEY = 'vast-secret';

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer vast-secret');
      return new Response(JSON.stringify({
        id: 7,
        balance: 4.87,
        api_key: 'must-not-escape',
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const account = await getVastAccountSummary();
    expect(account).toEqual({ id: 7, balance: 4.87 });
    expect(JSON.stringify(account)).not.toContain('must-not-escape');
  });

  it('fails clearly when the API key cannot expose the account balance', async () => {
    process.env.VAST_API_KEY = 'vast-secret';

    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 7 }), { status: 200 })
    ));

    await expect(getVastAccountSummary()).rejects.toThrow(
      'no permite leer el saldo'
    );
  });

  it('searches only verified on-demand offers inside the GPU caps', async () => {
    process.env.VAST_API_KEY = 'vast-secret';
    let receivedBody: any;

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/bundles/');
      receivedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        offers: [
          { id: 2, dph_total: 0.28, gpu_name: 'GPU B', gpu_ram: 24000 },
          { id: 1, dph_total: 0.18, gpu_name: 'GPU A', gpu_ram: 24000 },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const profile = getGpuProfile('video');
    const offers = await searchVastOffers(profile, 0.96);

    expect(receivedBody.verified).toEqual({ eq: true });
    expect(receivedBody.rentable).toEqual({ eq: true });
    expect(receivedBody.rented).toEqual({ eq: false });
    expect(receivedBody.type).toBe('on-demand');
    expect(receivedBody.gpu_ram).toEqual({ gte: 24000 });
    expect(receivedBody.dph_total).toEqual({ lte: profile.maxHourlyUsd });
    expect(receivedBody.reliability).toEqual({ gte: 0.96 });
    expect(offers.map((offer) => offer.id)).toEqual([1, 2]);
  });

  it('creates and destroys an instance through the current Vast endpoints', async () => {
    process.env.VAST_API_KEY = 'vast-secret';
    const calls: Array<{ url: string; method?: string; body?: any }> = [];

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = {
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);

      if (call.method === 'PUT') {
        return new Response(JSON.stringify({ new_contract: 12345 }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await createVastInstance({
      offerId: 99,
      image: 'pytorch/pytorch:test',
      diskGb: 10,
      label: 'nayla-test',
      onstart: 'echo ok',
      env: { TEST_ONLY: '1' },
    });
    expect(created.instanceId).toBe(12345);
    expect(calls[0]?.url).toContain('/asks/99/');
    expect(calls[0]?.body.cancel_unavail).toBe(true);
    expect(calls[0]?.body.env).toEqual({ TEST_ONLY: '1' });

    await destroyVastInstance(12345);
    expect(calls[1]?.url).toContain('/instances/12345/');
    expect(calls[1]?.method).toBe('DELETE');
  });
});

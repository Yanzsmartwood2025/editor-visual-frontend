import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getProviderCandidates,
  getProviderDefinition,
  getProviderRuntimeStatus,
} from '../lib/mediaProviders/registry';
import { searchStockMedia } from '../lib/mediaProviders/stock';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('media provider registry', () => {
  it('treats Openverse as anonymous unless both OAuth values exist', () => {
    delete process.env.OPENVERSE_CLIENT_ID;
    delete process.env.OPENVERSE_CLIENT_SECRET;

    const openverse = getProviderDefinition('openverse');
    expect(openverse).toBeDefined();
    expect(getProviderRuntimeStatus(openverse!)).toMatchObject({
      configured: true,
      mode: 'anonymous',
    });

    process.env.OPENVERSE_CLIENT_ID = 'client-id';
    expect(getProviderRuntimeStatus(openverse!)).toMatchObject({
      configured: true,
      mode: 'anonymous',
    });

    process.env.OPENVERSE_CLIENT_SECRET = 'client-secret';
    expect(getProviderRuntimeStatus(openverse!)).toMatchObject({
      configured: true,
      mode: 'authenticated',
    });
  });

  it('routes TTS providers by configured priority without exposing credentials', () => {
    process.env.DEEPGRAM_API_KEY = 'deepgram-secret';
    process.env.CARTESIA_API_KEY = 'cartesia-secret';
    delete process.env.ELEVENLABS_API_KEY;

    const providers = getProviderCandidates('tts');
    expect(providers.map((provider) => provider.id)).toEqual(['deepgram', 'cartesia']);
    expect(JSON.stringify(providers)).not.toContain('deepgram-secret');
    expect(JSON.stringify(providers)).not.toContain('cartesia-secret');
  });
});

describe('stock media engine', () => {
  it('falls back to Pixabay when Pexels fails and normalizes the result', async () => {
    process.env.PEXELS_API_KEY = 'pexels-key';
    process.env.PIXABAY_API_KEY = 'pixabay-key';

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith('https://api.pexels.com/')) {
        return new Response('provider unavailable', { status: 503 });
      }

      if (url.startsWith('https://pixabay.com/api/')) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                id: 42,
                tags: 'night, stars',
                pageURL: 'https://pixabay.com/photos/example-42/',
                webformatURL: 'https://cdn.example/preview.jpg',
                largeImageURL: 'https://cdn.example/full.jpg',
                user: 'Creator',
                user_id: 77,
                imageWidth: 1920,
                imageHeight: 1080,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('unexpected url', { status: 500 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await searchStockMedia({
      query: 'night stars',
      kind: 'image',
      limit: 1,
      providers: ['pexels', 'pixabay'],
    });

    expect(response.providersTried).toEqual(['pexels', 'pixabay']);
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]?.provider).toBe('pexels');
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      provider: 'pixabay',
      kind: 'image',
      mediaUrl: 'https://cdn.example/full.jpg',
      licenseName: 'Pixabay Content License',
      creator: 'Creator',
    });
  });
});

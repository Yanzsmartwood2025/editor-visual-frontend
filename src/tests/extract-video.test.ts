import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/api/extract-video';

// Mock dependencies
const mockSelect = vi.fn();
const mockIlike = vi.fn();
const mockEq = vi.fn();
const mockGt = vi.fn();
const mockNot = vi.fn();
const mockOrder = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: mockSelect.mockReturnValue({
        ilike: mockIlike.mockReturnValue({
          eq: mockEq.mockReturnValue({
            gt: mockGt.mockReturnValue({
              not: mockNot.mockReturnValue({
                order: mockOrder
              })
            })
          })
        })
      })
    })
  })
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('extract-video API endpoint', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables
    process.env.ORACLE_SERVER_URL = 'http://test-oracle:3001';
    process.env.ORACLE_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    req = {
      method: 'POST',
      body: { url: 'https://example.com/video' }
    };

    res = {
      status: statusMock
    };

    // Mock console methods to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should use the single valid key if one is available', async () => {
    // Mock Supabase returning one valid key
    mockOrder.mockResolvedValueOnce({
      data: [{ api_key: 'valid-key-1', character_name: 'arIA' }],
      error: null
    });

    // Mock Oracle fetch success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ videoUrl: 'https://oracle.com/video.mp4' })
    });

    await handler(req as NextApiRequest, res as NextApiResponse);

    // Ensure the key was sent to Oracle
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-oracle:3001/api/extract-meta',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-gemini-api-key': 'valid-key-1'
        })
      })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Gemini API Key seleccionada de la base de datos (character_name: 'arIA')."));
  });

  it('should choose the key with the highest monthly_limit if multiple are available', async () => {
    // Since we rely on the DB to sort (`.order`), we mock the DB returning sorted data
    // The first item should be picked
    mockOrder.mockResolvedValueOnce({
      data: [
        { api_key: 'best-key', character_name: 'arIA-Pro' },
        { api_key: 'other-key', character_name: 'arIA' }
      ],
      error: null
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ videoUrl: 'https://oracle.com/video.mp4' })
    });

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-oracle:3001/api/extract-meta',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-gemini-api-key': 'best-key'
        })
      })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Gemini API Key seleccionada de la base de datos (character_name: 'arIA-Pro')."));
  });

  it('should call Oracle without a key and log a warning if no valid keys are available', async () => {
    // Mock Supabase returning no valid keys (either empty array or array with empty keys)
    mockOrder.mockResolvedValueOnce({
      data: [
        { api_key: '', character_name: 'general' },
        { api_key: null, character_name: 'empty' }
      ],
      error: null
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ videoUrl: 'https://oracle.com/video.mp4' })
    });

    await handler(req as NextApiRequest, res as NextApiResponse);

    // Oracle should still be called, but without the 'x-gemini-api-key' header
    const fetchCallHeaders = mockFetch.mock.calls[0][1].headers;
    expect(fetchCallHeaders).not.toHaveProperty('x-gemini-api-key');

    expect(console.warn).toHaveBeenCalledWith('[extract-video] 0 keys de Gemini con cuota disponible (o todas vacías).');
  });

  it('should call Oracle without a key and log a warning if 0 rows are returned from DB', async () => {
    // Mock Supabase returning 0 rows
    mockOrder.mockResolvedValueOnce({
      data: [],
      error: null
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ videoUrl: 'https://oracle.com/video.mp4' })
    });

    await handler(req as NextApiRequest, res as NextApiResponse);

    const fetchCallHeaders = mockFetch.mock.calls[0][1].headers;
    expect(fetchCallHeaders).not.toHaveProperty('x-gemini-api-key');

    expect(console.warn).toHaveBeenCalledWith('[extract-video] 0 keys de Gemini con cuota disponible.');
  });
});

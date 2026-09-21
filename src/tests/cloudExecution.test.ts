import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  providerCanExecuteAction,
  startCloudProviderExecution,
} from '../lib/mediaProviders/execution';
import type { NaylaAction } from '../lib/naylaActions';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Nayla Cloud executors', () => {
  it('recognizes executable image, video, audio and 3D routes', () => {
    const image: NaylaAction = {
      action: 'GENERATE_IMAGE',
      prompt: 'portrait',
    };
    const video: NaylaAction = {
      action: 'GENERATE_VIDEO',
      prompt: 'cinematic scene',
    };
    const tts: NaylaAction = {
      action: 'GENERATE_AUDIO',
      mode: 'tts',
      text: 'Hola',
    };
    const model3d: NaylaAction = {
      action: 'GENERATE_3D',
      mode: 'text_to_3d',
      prompt: 'wood chair',
    };

    expect(providerCanExecuteAction('fal', image)).toBe(true);
    expect(providerCanExecuteAction('replicate', video)).toBe(true);
    expect(providerCanExecuteAction('deepgram', tts)).toBe(true);
    expect(providerCanExecuteAction('cartesia', tts)).toBe(true);
    expect(providerCanExecuteAction('elevenlabs', tts)).toBe(true);
    expect(providerCanExecuteAction('tripo', model3d)).toBe(true);
    expect(providerCanExecuteAction('meshy', model3d)).toBe(true);
  });

  it('can prepare a queued image job without making a paid test call in CI', async () => {
    process.env.FAL_KEY = 'fal-test-secret';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        request_id: 'req_test_123',
        status_url: 'https://queue.fal.run/model/requests/req_test_123/status',
        response_url: 'https://queue.fal.run/model/requests/req_test_123',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await startCloudProviderExecution('fal', {
      action: 'GENERATE_IMAGE',
      prompt: 'a studio portrait',
    });

    expect(result).toMatchObject({
      state: 'queued',
      providerJobId: 'req_test_123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String((init.headers as Record<string, string>).Authorization)).toContain('fal-test-secret');
    expect(JSON.stringify(result)).not.toContain('fal-test-secret');
  });

  it('handles synchronous TTS output as private binary data', async () => {
    process.env.DEEPGRAM_API_KEY = 'deepgram-test-secret';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    ));

    const result = await startCloudProviderExecution('deepgram', {
      action: 'GENERATE_AUDIO',
      mode: 'tts',
      text: 'Hola mundo',
    });

    expect(result.state).toBe('completed');
    if (result.state !== 'completed') return;
    expect(result.output.kind).toBe('binary');
    if (result.output.kind !== 'binary') return;
    expect(result.output.contentType).toBe('audio/mpeg');
    expect(result.output.bytes.byteLength).toBe(4);
  });

  it('uses the current unified Tripo v2 task endpoint for text to 3D', async () => {
    process.env.TRIPO_API_KEY = 'tripo-test-secret';
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify({
        code: 0,
        data: { task_id: 'tripo_task_123' },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await startCloudProviderExecution('tripo', {
      action: 'GENERATE_3D',
      mode: 'text_to_3d',
      prompt: 'a walnut chair',
    });

    expect(result).toMatchObject({
      state: 'queued',
      providerJobId: 'tripo_task_123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0]))
      .toBe('https://api.tripo3d.ai/v2/openapi/task');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body || '{}'));
    expect(body).toMatchObject({
      type: 'text_to_model',
      model_version: 'v3.1-20260211',
      prompt: 'a walnut chair',
    });
    expect(JSON.stringify(result)).not.toContain('tripo-test-secret');
  });

});

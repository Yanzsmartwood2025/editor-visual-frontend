import { afterEach, describe, expect, it } from 'vitest';
import {
  capabilityForNaylaAction,
  getAvailableProvidersForAction,
  parseNaylaAction,
} from '../lib/naylaActions';
import { getProviderDefinition } from '../lib/mediaProviders/registry';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Nayla action contracts', () => {
  it('parses a stock search action and maps its capability', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'SEARCH_MEDIA',
      query: 'city at night',
      kind: 'video',
      limit: 4,
    }));

    expect(action).not.toBeNull();
    expect(action?.action).toBe('SEARCH_MEDIA');
    if (action) expect(capabilityForNaylaAction(action)).toBe('stock_video');
  });

  it('rejects unknown or malformed executable actions', () => {
    expect(parseNaylaAction('{"action":"DELETE_EVERYTHING"}')).toBeNull();
    expect(parseNaylaAction('{"action":"GENERATE_VIDEO","prompt":""}')).toBeNull();
  });

  it('routes voice cloning only to configured capable providers', () => {
    delete process.env.CARTESIA_API_KEY;
    process.env.ELEVENLABS_API_KEY = 'secret-value';

    const action = parseNaylaAction(JSON.stringify({
      action: 'GENERATE_AUDIO',
      mode: 'voice_clone',
      inputUrl: 'https://example.com/voice.wav',
    }));

    expect(action).not.toBeNull();
    const providers = action ? getAvailableProvidersForAction(action) : [];
    expect(providers.map((provider) => provider.id)).toEqual(['elevenlabs']);
    expect(JSON.stringify(providers)).not.toContain('secret-value');
  });

  it('parses an explicit Vast GPU workload without exposing credentials', () => {
    process.env.VAST_API_KEY = 'vast-secret';

    const action = parseNaylaAction(JSON.stringify({
      action: 'RUN_GPU_JOB',
      provider: 'vast',
      workload: 'video',
      jobType: 'video-upscale',
      inputUrls: ['https://cdn.example/input.mp4'],
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'RUN_GPU_JOB',
      provider: 'vast',
      workload: 'video',
      jobType: 'video-upscale',
    });
    const providers = action ? getAvailableProvidersForAction(action) : [];
    expect(providers.map((provider) => provider.id)).toEqual(['vast']);
    expect(JSON.stringify(providers)).not.toContain('vast-secret');
  });

  it('validates bounded ACE-Step GPU music options', () => {
    const valid = parseNaylaAction(JSON.stringify({
      action: 'RUN_GPU_JOB',
      provider: 'vast',
      workload: 'audio',
      jobType: 'ace-step-music',
      prompt: 'dark cinematic rock instrumental',
      options: {
        duration: 30,
        instrumental: true,
      },
    }));

    expect(valid).not.toBeNull();
    expect(valid).toMatchObject({
      action: 'RUN_GPU_JOB',
      workload: 'audio',
      jobType: 'ace-step-music',
      options: { duration: 30, instrumental: true },
    });

    const tooShort = parseNaylaAction(JSON.stringify({
      action: 'RUN_GPU_JOB',
      provider: 'vast',
      workload: 'audio',
      jobType: 'ace-step-music',
      prompt: 'short test',
      options: { duration: 5 },
    }));

    expect(tooShort).toBeNull();
  });

  it('records the detailed ElevenLabs and Tripo toolsets', () => {
    expect(getProviderDefinition('elevenlabs')?.capabilities).toEqual(expect.arrayContaining([
      'tts',
      'speech_to_text',
      'voice_clone',
      'voice_design',
      'voice_change',
      'voice_isolation',
      'dubbing',
      'music_generation',
      'sound_effects',
      'forced_alignment',
      'voice_agent',
    ]));

    expect(getProviderDefinition('tripo')?.capabilities).toEqual(expect.arrayContaining([
      '3d_generation',
      '3d_multiview',
      '3d_texturing',
      '3d_decimation',
      '3d_rigging',
      '3d_retargeting',
    ]));
  });
});

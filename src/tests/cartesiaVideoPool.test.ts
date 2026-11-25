import { describe, expect, it, vi } from 'vitest';
import { VIDEO_CARTESIA_KEY_NAMES, configuredVideoCartesiaSlots, createVideoCartesiaPool, videoVoiceReadiness } from '../lib/videoVoice/cartesiaVideoPool';

const env = {
  NAYLA_VIDEO_TTS_ENABLED: 'true',
  CARTESIA_VIDEO_API_KEY_01: 'NEW-ONE',
  CARTESIA_VIDEO_API_KEY_02: 'NEW-TWO',
  CARTESIA_VIDEO_VOICE_ID: '12345678-1234-1234-1234-123456789012',
};
const wav = new Uint8Array(64);
wav.set([82,73,70,70], 0);
const ok = () => new Response(wav, { status: 200, headers: {'Content-Type':'audio/wav'} });

describe('video-only Cartesia keys', () => {
  it('defines six slots and never uses legacy keys', () => {
    expect(VIDEO_CARTESIA_KEY_NAMES).toHaveLength(6);
    expect(configuredVideoCartesiaSlots({ CARTESIA_API_KEY:'OLD', CARTESIA_VIDEO_API_KEY_01:'A', CARTESIA_VIDEO_API_KEY_02:'A' })).toHaveLength(1);
    expect(JSON.stringify(videoVoiceReadiness(env))).not.toContain('NEW-ONE');
  });
  it('is disabled unless explicitly enabled', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ok());
    await expect(createVideoCartesiaPool({env:{...env,NAYLA_VIDEO_TTS_ENABLED:'false'},fetcher}).synthesize('Hola')).rejects.toThrow('VIDEO_VOICE_DISABLED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rotates across dedicated credentials without leaking secrets to body', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ok());
    const pool = createVideoCartesiaPool({env,fetcher});
    expect((await pool.synthesize('Hola')).slot).toBe('CARTESIA_VIDEO_API_KEY_01');
    expect((await pool.synthesize('Hello','en')).slot).toBe('CARTESIA_VIDEO_API_KEY_02');
    expect((await pool.synthesize('Hola')).slot).toBe('CARTESIA_VIDEO_API_KEY_01');
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.cartesia.ai/tts/bytes');
    const req = fetcher.mock.calls[0]?.[1];
    expect((req?.headers as Record<string,string>).Authorization).toBe('Bearer NEW-ONE');
    expect(String(req?.body)).not.toContain('NEW-ONE');
  });
  it('stops on rate limit without using another free account', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('PRIVATE',{status:429}));
    await expect(createVideoCartesiaPool({env,fetcher}).synthesize('Hola')).rejects.toThrow('CARTESIA_QUOTA_REACHED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

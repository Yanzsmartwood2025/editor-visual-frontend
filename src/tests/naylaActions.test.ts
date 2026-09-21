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

  it('accepts simple Remotion CPU editing instructions with perspective effects', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
          durationInSeconds: 4,
          efecto: 'parallax-3d',
          transitionType: 'fade',
          transitionDuration: 0.5,
          overlay: 'vignette',
          overlayIntensity: 0.35,
          brightness: 1.05,
          contrast: 1.15,
        },
        {
          type: 'audio',
          source: 'url',
          url: 'https://cdn.example/music.mp3',
          volume: 0.7,
          fadeIn: 0.8,
          fadeOut: 1.2,
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      render: true,
      assets: [
        expect.objectContaining({
          efecto: 'parallax-3d',
          overlay: 'vignette',
        }),
        expect.objectContaining({
          type: 'audio',
          volume: 0.7,
        }),
      ],
    });
  });


  it('accepts advanced Remotion transitions, professional effect chains and motion blur', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'video',
          source: 'url',
          url: 'https://cdn.example/video.mp4',
          durationInSeconds: 5,
          transitionType: 'film-burn',
          transitionDuration: 0.6,
          professionalEffects: [
            { type: 'color-correction', intensity: 0.55 },
            { type: 'chromatic-aberration', intensity: 0.25, angle: 8 },
            { type: 'glow', intensity: 0.2, color: '#ffffff' },
          ],
          motionBlur: {
            shutterAngle: 180,
            samples: 5,
          },
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      render: true,
      assets: [
        expect.objectContaining({
          transitionType: 'film-burn',
          professionalEffects: expect.arrayContaining([
            expect.objectContaining({ type: 'color-correction' }),
            expect.objectContaining({ type: 'chromatic-aberration' }),
          ]),
          motionBlur: {
            shutterAngle: 180,
            samples: 5,
          },
        }),
      ],
    });
  });



  it('accepts Lottie and Rive vector animation plans', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [],
      vectorAnimations: [
        {
          kind: 'lottie',
          url: 'https://cdn.example/logo.json',
          start: 0,
          end: 4,
          scale: 0.8,
          playbackRate: 1.25,
          direction: 'forward',
        },
        {
          kind: 'rive',
          url: 'https://cdn.example/icon.riv',
          start: 4,
          end: 8,
          fit: 'contain',
          alignment: 'center',
          artboard: 'Main',
          animation: 'Idle',
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      vectorAnimations: [
        expect.objectContaining({
          kind: 'lottie',
          playbackRate: 1.25,
        }),
        expect.objectContaining({
          kind: 'rive',
          artboard: 'Main',
          animation: 'Idle',
        }),
      ],
    });

    expect(parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [],
      vectorAnimations: [{
        kind: 'lottie',
        url: 'https://cdn.example/logo.json',
        start: 5,
        end: 2,
      }],
    }))).toBeNull();
  });

  it('accepts deterministic procedural motion on visual clips', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
          durationInSeconds: 5,
          proceduralMotion: {
            preset: 'starfield',
            intensity: 0.65,
            speed: 1.2,
            seed: 42,
            color: '#ffffff',
            accentColor: '#aaccff',
          },
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      assets: [
        expect.objectContaining({
          proceduralMotion: {
            preset: 'starfield',
            intensity: 0.65,
            speed: 1.2,
            seed: 42,
            color: '#ffffff',
            accentColor: '#aaccff',
          },
        }),
      ],
    });

    expect(parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [{
        type: 'video',
        source: 'url',
        url: 'https://cdn.example/video.mp4',
        proceduralMotion: {
          preset: 'unknown-preset',
        },
      }],
    }))).toBeNull();
  });

  it('accepts GSAP motion for complete visual clips', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'video',
          source: 'url',
          url: 'https://cdn.example/video.mp4',
          durationInSeconds: 5,
          gsapMotion: {
            enter: 'elastic',
            exit: 'slide-left',
            enterDuration: 0.8,
            exitDuration: 0.5,
            intensity: 1.2,
          },
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      assets: [
        expect.objectContaining({
          gsapMotion: {
            enter: 'elastic',
            exit: 'slide-left',
            enterDuration: 0.8,
            exitDuration: 0.5,
            intensity: 1.2,
          },
        }),
      ],
    });

    expect(parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [{
        type: 'foto',
        source: 'url',
        url: 'https://cdn.example/photo.jpg',
        gsapMotion: { intensity: 1 },
      }],
    }))).toBeNull();
  });

  it('accepts local browser background removal for stable video labels', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'REMOVE_VIDEO_BACKGROUND',
      label: 'V2',
      model: 'modnet',
      keepAudio: true,
      quality: 'high',
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'REMOVE_VIDEO_BACKGROUND',
      label: 'V2',
      model: 'modnet',
      keepAudio: true,
      quality: 'high',
    });

    expect(parseNaylaAction(JSON.stringify({
      action: 'REMOVE_VIDEO_BACKGROUND',
      label: 'F1',
    }))).toBeNull();

    expect(parseNaylaAction(JSON.stringify({
      action: 'REMOVE_VIDEO_BACKGROUND',
      label: 'V1',
      model: 'unsupported-model',
    }))).toBeNull();
  });

  it('accepts professional caption plans and rejects invalid timing', () => {
    const valid = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
          durationInSeconds: 5,
        },
      ],
      subtitles: [
        {
          text: 'Una línea limpia',
          start: 0,
          end: 2.5,
          style: 'cinematic',
          position: 'bottom',
          fontSize: 48,
        },
        {
          text: 'Palabra activa',
          start: 2.5,
          end: 5,
          style: 'karaoke',
          position: 'center',
        },
      ],
      render: true,
    }));

    expect(valid).not.toBeNull();
    expect(valid).toMatchObject({
      action: 'BUILD_TIMELINE',
      subtitles: [
        expect.objectContaining({ style: 'cinematic', position: 'bottom', fontSize: 48 }),
        expect.objectContaining({ style: 'karaoke', position: 'center' }),
      ],
    });

    const invalid = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
        },
      ],
      subtitles: [
        {
          text: 'Tiempo inválido',
          start: 4,
          end: 2,
        },
      ],
    }));

    expect(invalid).toBeNull();
  });

  it('accepts deterministic GSAP motion title plans', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
          durationInSeconds: 6,
        },
      ],
      titles: [
        {
          text: 'NAYLA',
          start: 0.4,
          end: 3.2,
          style: 'cinematic',
          animation: 'word-rise',
          position: 'center',
          fontSize: 78,
          color: '#ffffff',
          accentColor: '#dddddd',
        },
        {
          text: 'Edición inteligente',
          start: 3.4,
          end: 5.8,
          animation: 'lower-third',
          position: 'bottom',
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      titles: [
        expect.objectContaining({ animation: 'word-rise', style: 'cinematic' }),
        expect.objectContaining({ animation: 'lower-third', position: 'bottom' }),
      ],
    });

    const invalid = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.jpg',
        },
      ],
      titles: [
        {
          text: 'Tiempo incorrecto',
          start: 5,
          end: 1,
          animation: 'pop',
        },
      ],
    }));

    expect(invalid).toBeNull();
  });

  it('accepts real GLB scenes by stable M labels and supports 3D-only renders', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [],
      threeScenes: [
        {
          label: 'M1',
          start: 0,
          end: 8,
          modelScale: 1.2,
          autoRotate: true,
          rotationSpeed: 30,
          cameraDistance: 5.5,
          cameraFov: 40,
          lighting: 'dramatic',
          backgroundColor: '#000000',
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      assets: [],
      threeScenes: [
        expect.objectContaining({
          label: 'M1',
          lighting: 'dramatic',
          autoRotate: true,
        }),
      ],
    });

    expect(parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [],
      threeScenes: [],
      render: true,
    }))).toBeNull();

    expect(parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [],
      threeScenes: [
        {
          label: 'F1',
          start: 0,
          end: 4,
        },
      ],
    }))).toBeNull();
  });

  it('accepts explicit none values emitted by Nayla for simple timeline edits', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      assets: [
        {
          type: 'video',
          source: 'url',
          url: 'https://cdn.example/video.mp4',
          durationInSeconds: 3.5,
          efecto: 'none',
          transitionType: 'fade',
          transitionDuration: 0.5,
          overlay: 'none',
        },
        {
          type: 'foto',
          source: 'url',
          url: 'https://cdn.example/photo.png',
          durationInSeconds: 2.5,
          efecto: 'parallax-3d',
          overlay: 'vignette',
          overlayIntensity: 0.2,
        },
      ],
      render: true,
    }));

    expect(action).not.toBeNull();
    expect(action).toMatchObject({
      action: 'BUILD_TIMELINE',
      render: true,
      assets: [
        expect.objectContaining({ efecto: 'none', overlay: 'none' }),
        expect.objectContaining({ efecto: 'parallax-3d', overlay: 'vignette' }),
      ],
    });
  });

});

import { describe, expect, it } from 'vitest';
import {
  getNaylaAudioBusGain,
  getNaylaMusicDuckGain,
  NAYLA_AUDIO_MIX_PRESETS,
  resolveNaylaAudioMix,
} from '../lib/naylaAudioMix';
import { parseNaylaAction } from '../lib/naylaActions';
import { parseNaylaDirectInstruction } from '../lib/naylaDirectInstructions';
import { NAYLA_EDITOR_FEATURE_CATALOG } from '../lib/naylaFeatureCatalog';

describe('Nayla audio mixer', () => {
  it('resuelve presets de mezcla con buses y master', () => {
    const mix = resolveNaylaAudioMix({ preset: 'voice-focus' });
    expect(mix.masterGain).toBeCloseTo(NAYLA_AUDIO_MIX_PRESETS['voice-focus'].masterGain);
    expect(getNaylaAudioBusGain('voice', mix)).toBe(1);
    expect(getNaylaAudioBusGain('music', mix)).toBeLessThan(1);
  });

  it('aplica ducking suave antes, durante y después de la voz', () => {
    const mix = resolveNaylaAudioMix({
      preset: 'voice-focus',
      duckMusicGain: 0.2,
      duckAttack: 1,
      duckRelease: 2,
    });
    const intervals = [{ start: 5, end: 10 }];

    expect(getNaylaMusicDuckGain(3.5, intervals, mix)).toBe(1);
    expect(getNaylaMusicDuckGain(4.5, intervals, mix)).toBeCloseTo(0.6, 5);
    expect(getNaylaMusicDuckGain(7, intervals, mix)).toBeCloseTo(0.2, 5);
    expect(getNaylaMusicDuckGain(11, intervals, mix)).toBeCloseTo(0.6, 5);
    expect(getNaylaMusicDuckGain(12.5, intervals, mix)).toBe(1);
  });

  it('acepta buses y audioMix en BUILD_TIMELINE', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      audioMix: { preset: 'podcast', autoDucking: true },
      assets: [
        { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 10, audioBus: 'voice' },
        { type: 'audio', source: 'label', label: 'A2', durationInSeconds: 10, audioBus: 'music' },
      ],
      render: true,
    }));

    expect(action?.action).toBe('BUILD_TIMELINE');
    if (action?.action !== 'BUILD_TIMELINE') return;
    expect(action.audioMix?.preset).toBe('podcast');
    expect(action.assets[0].audioBus).toBe('voice');
    expect(action.assets[1].audioBus).toBe('music');
  });

  it('acepta mezcla y buses desde @direct', () => {
    const result = parseNaylaDirectInstruction(`@direct
mix: voice-focus
master: 0.92
ducking: yes
duckGain: 0.18
duckAttack: 0.25s
duckRelease: 0.7s
audio:
- A1 | 12s | bus=voice | volume=1
- A2 | 20s | music | volume=0.8 | fadeIn=1s | fadeOut=2s
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.action.audioMix).toMatchObject({
      preset: 'voice-focus',
      masterGain: 0.92,
      autoDucking: true,
      duckMusicGain: 0.18,
      duckAttack: 0.25,
      duckRelease: 0.7,
    });
    expect(result.plan.action.assets[0]).toMatchObject({ label: 'A1', audioBus: 'voice' });
    expect(result.plan.action.assets[1]).toMatchObject({ label: 'A2', audioBus: 'music', fadeIn: 1, fadeOut: 2 });
  });

  it('publica mezcla y SFX en la Biblioteca visible', () => {
    const mix = NAYLA_EDITOR_FEATURE_CATALOG.find((category) => category.id === 'audio-mix');
    const sfx = NAYLA_EDITOR_FEATURE_CATALOG.find((category) => category.id === 'audio-sfx');
    expect(mix?.items.map((item) => item.id)).toContain('auto-ducking');
    expect(mix?.items.map((item) => item.id)).toContain('mix-podcast');
    expect((sfx?.items.length || 0)).toBeGreaterThan(5);
  });
});

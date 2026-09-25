import { describe, expect, it } from 'vitest';
import {
  buildNaylaAudioMasterFilter,
  hasNaylaAudioMasterProcessing,
} from '../lib/naylaAudioMaster';
import { parseNaylaAction } from '../lib/naylaActions';
import { parseNaylaDirectInstruction } from '../lib/naylaDirectInstructions';
import { NAYLA_EDITOR_FEATURE_CATALOG } from '../lib/naylaFeatureCatalog';

describe('Nayla advanced audio DSP', () => {
  it('builds deterministic FFmpeg chains for master presets', () => {
    const voice = buildNaylaAudioMasterFilter({ preset: 'voice-polish' });
    expect(voice).toContain('highpass=f=80');
    expect(voice).toContain('acompressor=');
    expect(voice).toContain('alimiter=');

    const telephone = buildNaylaAudioMasterFilter({ preset: 'telephone' });
    expect(telephone).toContain('highpass=f=300');
    expect(telephone).toContain('lowpass=f=3400');

    const dreamy = buildNaylaAudioMasterFilter({ preset: 'dreamy-reverb' });
    expect(dreamy).toContain('aecho=');
  });

  it('combines manual EQ, gate, de-esser, reverb, echo and pan', () => {
    const filter = buildNaylaAudioMasterFilter({
      preset: 'none',
      lowCutHz: 90,
      highCutHz: 12000,
      bassDb: 3,
      presenceDb: 2,
      compressor: true,
      limiter: true,
      normalize: true,
      noiseReduction: true,
      noiseGate: true,
      deEsser: 0.5,
      reverb: 0.3,
      echo: 0.2,
      pan: -0.25,
    });

    expect(filter).toContain('highpass=f=90');
    expect(filter).toContain('lowpass=f=12000');
    expect(filter).toContain('equalizer=f=110');
    expect(filter).toContain('equalizer=f=2800');
    expect(filter).toContain('afftdn=');
    expect(filter).toContain('agate=');
    expect(filter).toContain('aecho=');
    expect(filter).toContain('pan=stereo');
    expect(filter).toContain('loudnorm=');
    expect(hasNaylaAudioMasterProcessing({ preset: 'none', limiter: true })).toBe(true);
    expect(hasNaylaAudioMasterProcessing({ preset: 'none' })).toBe(false);
  });

  it('accepts audioMaster and pitch in BUILD_TIMELINE', () => {
    const action = parseNaylaAction(JSON.stringify({
      action: 'BUILD_TIMELINE',
      audioMaster: { preset: 'podcast-master', limiter: true, deEsser: 0.4 },
      assets: [
        { type: 'audio', source: 'label', label: 'A1', durationInSeconds: 8, audioBus: 'voice', pitch: 0.9 },
      ],
      render: true,
    }));

    expect(action?.action).toBe('BUILD_TIMELINE');
    if (action?.action !== 'BUILD_TIMELINE') return;
    expect(action.audioMaster?.preset).toBe('podcast-master');
    expect(action.assets[0].pitch).toBe(0.9);
  });

  it('accepts DSP controls from @direct', () => {
    const result = parseNaylaDirectInstruction(`@direct
masterFx: voice-polish
lowCut: 85
presence: 2.5
compressor: yes
limiter: yes
noiseReduction: yes
noiseGate: yes
deEsser: 0.4
reverb: 0.15
echo: 0.1
pan: -0.2
audio:
- A1 | 8s | bus=voice | pitch=0.95
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.action.audioMaster).toMatchObject({
      preset: 'voice-polish',
      lowCutHz: 85,
      presenceDb: 2.5,
      compressor: true,
      limiter: true,
      noiseReduction: true,
      noiseGate: true,
      deEsser: 0.4,
      reverb: 0.15,
      echo: 0.1,
      pan: -0.2,
    });
    expect(result.plan.action.assets[0]).toMatchObject({ audioBus: 'voice', pitch: 0.95 });
  });

  it('publishes advanced DSP in the visible library', () => {
    const category = NAYLA_EDITOR_FEATURE_CATALOG.find((item) => item.id === 'audio-master');
    expect(category?.items.map((item) => item.id)).toContain('compressor');
    expect(category?.items.map((item) => item.id)).toContain('de-esser');
    expect(category?.items.map((item) => item.id)).toContain('master-telephone');
    expect(category?.items.map((item) => item.id)).toContain('pitch');
  });
});

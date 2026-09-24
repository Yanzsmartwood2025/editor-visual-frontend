import { describe, expect, it } from 'vitest';
import { NAYLA_EDITING_LIBRARY } from '../lib/naylaEditingLibrary';
import { parseNaylaAction } from '../lib/naylaActions';
import { getAutomatedGain, volumeKeyframesSchema } from '../lib/audioAutomation';

describe('executable editing library', () => {
  for (const recipe of NAYLA_EDITING_LIBRARY) {
    it(`accepts ${recipe.id} with the real action validator`, () => {
      expect(parseNaylaAction(JSON.stringify(recipe.example))).not.toBeNull();
    });
  }
  it('preserves the music curve through action parsing and interpolates its ramps', () => {
    const recipe = NAYLA_EDITING_LIBRARY.find(r => r.id === 'music-under-voice')!;
    const action = parseNaylaAction(JSON.stringify(recipe.example));
    if (action?.action !== 'BUILD_TIMELINE') throw new Error('Invalid fixture');
    const track = action.assets[0];
    expect(track.volume).toBe(0.7);
    expect(getAutomatedGain(track.volumeKeyframes, 0)).toBe(1);
    expect(getAutomatedGain(track.volumeKeyframes, 7.5)).toBeCloseTo(0.6);
    expect(getAutomatedGain(track.volumeKeyframes, 12)).toBe(0.2);
    expect(getAutomatedGain(track.volumeKeyframes, 16.5)).toBeCloseTo(0.6);
    expect(getAutomatedGain(track.volumeKeyframes, 20)).toBe(1);
  });
  it('rejects duplicate, unordered, excessive and negative keyframes', () => {
    for (const points of [
      [{ time: 0, gain: 1 }, { time: 0, gain: 0 }],
      [{ time: 2, gain: 1 }, { time: 1, gain: 0 }],
      [{ time: 0, gain: 1 }, { time: 1, gain: 2 }],
      [{ time: -1, gain: 1 }, { time: 1, gain: 0 }],
    ]) expect(volumeKeyframesSchema.safeParse(points).success).toBe(false);
  });
  it('preserves existing volume behavior without automation', () => {
    expect(getAutomatedGain(undefined, 10)).toBe(1);
  });
});

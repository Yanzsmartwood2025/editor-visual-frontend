import { expect, it } from 'vitest';
import { formatPlaybackTime } from '../lib/playbackTime';
it('formats real playback positions and unknown metadata safely', () => {
  expect(formatPlaybackTime(42.9)).toBe('00:00:42');
  expect(formatPlaybackTime(3671)).toBe('01:01:11');
  expect(formatPlaybackTime(Infinity)).toBe('00:00:00');
  expect(formatPlaybackTime(NaN)).toBe('00:00:00');
});

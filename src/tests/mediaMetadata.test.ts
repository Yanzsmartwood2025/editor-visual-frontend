import { describe, expect, it } from 'vitest';
import {
  buildMediaMetadata,
  getAspectRatioLabel,
  getCanvasDimensionsFromRatio,
  parseAspectRatioLabel,
} from '../lib/mediaMetadata';

describe('media metadata helpers', () => {
  it('detects common and arbitrary ratios exactly', () => {
    expect(getAspectRatioLabel(1080, 1920)).toBe('9/16');
    expect(getAspectRatioLabel(1920, 1080)).toBe('16/9');
    expect(getAspectRatioLabel(3024, 4032)).toBe('3/4');
  });

  it('builds metadata with dimensions and duration', () => {
    expect(buildMediaMetadata(1080, 1920, 7.5)).toEqual({
      width: 1080,
      height: 1920,
      aspectRatio: 1080 / 1920,
      aspectRatioLabel: '9/16',
      durationInSeconds: 7.5,
    });
  });

  it('creates even H.264-friendly canvas dimensions at the selected quality', () => {
    expect(getCanvasDimensionsFromRatio('9/16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(getCanvasDimensionsFromRatio('16/9', '720p')).toEqual({ width: 1280, height: 720 });
    expect(getCanvasDimensionsFromRatio('4/5', '1080p')).toEqual({ width: 1080, height: 1350 });
    expect(getCanvasDimensionsFromRatio('3/4', '480p')).toEqual({ width: 480, height: 640 });
  });

  it('falls back safely when a ratio is invalid', () => {
    expect(parseAspectRatioLabel('bad')).toEqual({ widthRatio: 9, heightRatio: 16 });
  });
});

import { describe, expect, it } from 'vitest';
import { buildVisualTimelineMetrics, getCompositionDurationInFrames } from '../lib/timelineMetrics';

describe('timeline metrics', () => {
  it('accounts for playback rate, delay and transitions consistently', () => {
    const timeline = [
      { id: 'v1', tipo: 'video' as const, durationInSeconds: 10, playbackRate: 2 },
      { id: 'v2', tipo: 'video' as const, durationInSeconds: 6, transitionType: 'fade', transitionDuration: 1 },
      { id: 'f1', tipo: 'foto' as const, durationInSeconds: 4, delay: 2, transitionType: 'slide', transitionDuration: 1 },
    ];

    const metrics = buildVisualTimelineMetrics(timeline, 30);

    expect(metrics[0].durationInFrames).toBe(150);
    expect(metrics[0].transitionAfterFrames).toBe(30);
    expect(metrics[1].absoluteStartFrame).toBe(120);
    expect(metrics[1].transitionAfterFrames).toBe(0);
    expect(metrics[2].absoluteStartFrame).toBe(360);
    expect(getCompositionDurationInFrames(timeline, 30)).toBe(480);
  });

  it('extends the composition for delayed audio and subtitles', () => {
    const timeline = [
      { tipo: 'foto' as const, durationInSeconds: 5 },
      { tipo: 'audio' as const, durationInSeconds: 8, delay: 2 },
    ];

    expect(getCompositionDurationInFrames(timeline, 30, [{ inicioSec: 0, finSec: 12 }])).toBe(360);
  });

  it('caps transitions so they cannot exceed adjacent clips', () => {
    const timeline = [
      { tipo: 'video' as const, durationInSeconds: 1 },
      { tipo: 'video' as const, durationInSeconds: 1, transitionType: 'fade', transitionDuration: 5 },
    ];

    const metrics = buildVisualTimelineMetrics(timeline, 30);
    expect(metrics[0].transitionAfterFrames).toBe(29);
    expect(getCompositionDurationInFrames(timeline, 30)).toBe(31);
  });
});

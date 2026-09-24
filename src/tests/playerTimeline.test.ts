import { describe, expect, it } from 'vitest';
import {
  formatPlaybackClock,
  getVisualClipStartSeconds,
  getVisualTimelineDurationSeconds,
  resolveVisualTimelineTime,
} from '../lib/playerTimeline';

describe('player timeline helpers', () => {
  const timeline = [
    { id: 'v1', tipo: 'video' as const, durationInSeconds: 10 },
    { id: 'a1', tipo: 'audio' as const, durationInSeconds: 30 },
    { id: 'v2', tipo: 'video' as const, durationInSeconds: 7.5 },
  ];

  it('uses only visual clips for the player clock', () => {
    expect(getVisualTimelineDurationSeconds(timeline)).toBe(17.5);
    expect(getVisualClipStartSeconds(timeline, 'v2')).toBe(10);
  });

  it('maps an absolute playhead position to clip-local time', () => {
    const position = resolveVisualTimelineTime(timeline, 12.25);
    expect(position?.clip.id).toBe('v2');
    expect(position?.localTime).toBe(2.25);
    expect(position?.absoluteTime).toBe(12.25);
  });

  it('clamps seeks at the end of the timeline', () => {
    const position = resolveVisualTimelineTime(timeline, 999);
    expect(position?.clip.id).toBe('v2');
    expect(position?.localTime).toBe(7.5);
    expect(position?.absoluteTime).toBe(17.5);
  });

  it('formats the player counter as HH:MM:SS', () => {
    expect(formatPlaybackClock(0)).toBe('00:00:00');
    expect(formatPlaybackClock(65.9)).toBe('00:01:05');
    expect(formatPlaybackClock(3661)).toBe('01:01:01');
  });
});

export type PlayerTimelineClip = {
  id: string;
  tipo: 'foto' | 'video' | 'audio';
  durationInSeconds?: number;
  metadata?: { durationInSeconds?: number };
};

const finitePositive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const getPlayerClipDurationSeconds = (clip: PlayerTimelineClip): number => {
  return (
    finitePositive(clip.durationInSeconds) ??
    finitePositive(clip.metadata?.durationInSeconds) ??
    (clip.tipo === 'foto' ? 5 : 0)
  );
};

export const getVisualPlayerClips = <T extends PlayerTimelineClip>(timeline: T[]): T[] =>
  timeline.filter((clip) => clip.tipo === 'video' || clip.tipo === 'foto');

export const getVisualTimelineDurationSeconds = (timeline: PlayerTimelineClip[]): number =>
  getVisualPlayerClips(timeline).reduce(
    (total, clip) => total + getPlayerClipDurationSeconds(clip),
    0
  );

export const getVisualClipStartSeconds = (
  timeline: PlayerTimelineClip[],
  clipId: string
): number => {
  let cursor = 0;
  for (const clip of getVisualPlayerClips(timeline)) {
    if (clip.id === clipId) return cursor;
    cursor += getPlayerClipDurationSeconds(clip);
  }
  return 0;
};

export const resolveVisualTimelineTime = <T extends PlayerTimelineClip>(
  timeline: T[],
  requestedSeconds: number
): {
  clip: T;
  index: number;
  localTime: number;
  absoluteTime: number;
  totalDuration: number;
} | null => {
  const clips = getVisualPlayerClips(timeline);
  if (!clips.length) return null;

  const totalDuration = clips.reduce(
    (total, clip) => total + getPlayerClipDurationSeconds(clip),
    0
  );
  const absoluteTime = Math.min(
    totalDuration,
    Math.max(0, Number.isFinite(requestedSeconds) ? requestedSeconds : 0)
  );

  let cursor = 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const duration = getPlayerClipDurationSeconds(clip);
    const end = cursor + duration;
    const isLast = index === clips.length - 1;

    if (absoluteTime < end || isLast) {
      return {
        clip,
        index,
        localTime: Math.min(duration, Math.max(0, absoluteTime - cursor)),
        absoluteTime,
        totalDuration,
      };
    }

    cursor = end;
  }

  return null;
};

export const formatPlaybackClock = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

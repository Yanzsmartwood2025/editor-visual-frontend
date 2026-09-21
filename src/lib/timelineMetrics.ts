export type TimelineMetricItem = {
  id?: string;
  tipo: 'foto' | 'video' | 'audio';
  durationInSeconds?: number;
  originalDurationInSeconds?: number;
  playbackRate?: number;
  delay?: number;
  startFrom?: number;
  trimBefore?: number;
  trimAfter?: number;
  loop?: boolean;
  transitionDuration?: number;
  transitionType?: string;
};

export type SubtitleMetricItem = {
  inicioSec?: number;
  finSec?: number;
};

export type LogoMetricItem = {
  inicioSec?: number;
  finSec?: number;
};

export type TitleMetricItem = {
  start?: number;
  end?: number;
};

export type VisualTimelineMetric<T extends TimelineMetricItem = TimelineMetricItem> = T & {
  durationInFrames: number;
  delayInFrames: number;
  absoluteStartFrame: number;
  transitionAfterFrames: number;
};

const safeNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const getPlayableDurationInSeconds = (item: TimelineMetricItem): number => {
  const defaultDuration = item.tipo === 'foto' ? 5 : 0;
  const declaredDuration = Math.max(0, safeNumber(item.durationInSeconds, defaultDuration));

  if (item.tipo === 'foto' || item.loop) {
    return declaredDuration;
  }

  const sourceDuration = Math.max(
    0,
    safeNumber(item.originalDurationInSeconds, declaredDuration)
  );

  const hasTrim =
    item.trimBefore !== undefined ||
    item.startFrom !== undefined ||
    item.trimAfter !== undefined;

  if (!hasTrim) {
    return declaredDuration;
  }

  const trimStart = Math.min(
    sourceDuration,
    Math.max(0, safeNumber(item.trimBefore ?? item.startFrom, 0))
  );

  const requestedEnd = item.trimAfter === undefined
    ? sourceDuration
    : safeNumber(item.trimAfter, sourceDuration);

  const trimEnd = Math.min(
    sourceDuration,
    Math.max(trimStart, requestedEnd)
  );

  return Math.max(0, trimEnd - trimStart);
};

export const getItemDurationInFrames = (item: TimelineMetricItem, fps: number): number => {
  const playableSeconds = getPlayableDurationInSeconds(item);
  const playbackRate = Math.max(0.01, safeNumber(item.playbackRate, 1));
  return Math.max(1, Math.round((playableSeconds / playbackRate) * fps));
};

export const getItemDelayInFrames = (item: TimelineMetricItem, fps: number): number =>
  Math.max(0, Math.round(Math.max(0, safeNumber(item.delay, 0)) * fps));

const getRequestedTransitionInFrames = (item: TimelineMetricItem, fps: number): number => {
  if (!item.transitionType || item.transitionType === 'none') return 0;
  return Math.max(0, Math.round(Math.max(0, safeNumber(item.transitionDuration, 0)) * fps));
};

export const buildVisualTimelineMetrics = <T extends TimelineMetricItem>(
  timeline: T[],
  fps: number
): VisualTimelineMetric<T>[] => {
  const visualItems = timeline.filter((item) => item.tipo === 'video' || item.tipo === 'foto');
  const metrics: VisualTimelineMetric<T>[] = [];
  let cursor = 0;

  for (let index = 0; index < visualItems.length; index++) {
    const item = visualItems[index];
    const delayInFrames = getItemDelayInFrames(item, fps);
    const durationInFrames = getItemDurationInFrames(item, fps);

    cursor += delayInFrames;
    const absoluteStartFrame = cursor;
    cursor += durationInFrames;

    let transitionAfterFrames = 0;
    const nextItem = visualItems[index + 1];

    if (nextItem) {
      const nextDelay = getItemDelayInFrames(nextItem, fps);

      // A delay represents a real black gap. Do not overlap a transition across that gap.
      if (nextDelay === 0) {
        const requested = getRequestedTransitionInFrames(nextItem, fps);
        if (requested > 0) {
          const nextDuration = getItemDurationInFrames(nextItem, fps);
          const maxSafeTransition = Math.max(0, Math.min(durationInFrames - 1, nextDuration - 1));
          transitionAfterFrames = Math.min(requested, maxSafeTransition);
          cursor -= transitionAfterFrames;
        }
      }
    }

    metrics.push({
      ...item,
      durationInFrames,
      delayInFrames,
      absoluteStartFrame,
      transitionAfterFrames,
    });
  }

  return metrics;
};

export const getCompositionDurationInFrames = (
  timeline: TimelineMetricItem[],
  fps: number,
  subtitles: SubtitleMetricItem[] = [],
  logos: LogoMetricItem[] = [],
  titles: TitleMetricItem[] = []
): number => {
  const visualMetrics = buildVisualTimelineMetrics(timeline, fps);
  const visualEnd = visualMetrics.reduce(
    (max, item) => Math.max(max, item.absoluteStartFrame + item.durationInFrames),
    0
  );

  const audioEnd = timeline
    .filter((item) => item.tipo === 'audio')
    .reduce((max, item) => {
      const start = getItemDelayInFrames(item, fps);
      return Math.max(max, start + getItemDurationInFrames(item, fps));
    }, 0);

  const subtitleEnd = subtitles.reduce((max, item) => {
    const end = Math.max(0, safeNumber(item.finSec, safeNumber(item.inicioSec, 0)));
    return Math.max(max, Math.round(end * fps));
  }, 0);

  const logoEnd = logos.reduce((max, item) => {
    if (item.finSec === undefined) return max;
    return Math.max(max, Math.round(Math.max(0, safeNumber(item.finSec, 0)) * fps));
  }, 0);

  const titleEnd = titles.reduce((max, item) => {
    const end = Math.max(0, safeNumber(item.end, safeNumber(item.start, 0)));
    return Math.max(max, Math.round(end * fps));
  }, 0);

  return Math.max(1, visualEnd, audioEnd, subtitleEnd, logoEnd, titleEnd);
};

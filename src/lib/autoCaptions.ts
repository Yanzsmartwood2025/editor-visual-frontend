export type TimedSpeechWord = {
  text: string;
  startInSeconds: number;
  endInSeconds: number;
};

export type AutoCaptionSegment = {
  text: string;
  start: number;
  end: number;
};

export const groupSpeechWordsIntoCaptions = (
  words: TimedSpeechWord[],
  options: {
    maxWords?: number;
    maxDurationInSeconds?: number;
    maxCharacters?: number;
  } = {}
): AutoCaptionSegment[] => {
  const maxWords = Math.max(1, Math.floor(options.maxWords ?? 6));
  const maxDurationInSeconds = Math.max(0.4, options.maxDurationInSeconds ?? 2.6);
  const maxCharacters = Math.max(8, Math.floor(options.maxCharacters ?? 46));

  const valid = words
    .filter((word) =>
      typeof word?.text === 'string' &&
      word.text.trim().length > 0 &&
      Number.isFinite(word.startInSeconds) &&
      Number.isFinite(word.endInSeconds) &&
      word.endInSeconds > word.startInSeconds
    )
    .map((word) => ({
      text: word.text.trim(),
      startInSeconds: Math.max(0, word.startInSeconds),
      endInSeconds: Math.max(word.startInSeconds, word.endInSeconds),
    }));

  const segments: AutoCaptionSegment[] = [];
  let bucket: typeof valid = [];

  const flush = () => {
    if (!bucket.length) return;
    const text = bucket
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) {
      segments.push({
        text,
        start: bucket[0].startInSeconds,
        end: bucket[bucket.length - 1].endInSeconds,
      });
    }
    bucket = [];
  };

  for (const word of valid) {
    if (!bucket.length) {
      bucket = [word];
      continue;
    }

    const candidate = [...bucket, word];
    const candidateText = candidate
      .map((item) => item.text)
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1');
    const candidateDuration =
      candidate[candidate.length - 1].endInSeconds - candidate[0].startInSeconds;

    const wouldOverflow =
      candidate.length > maxWords ||
      candidateText.length > maxCharacters ||
      candidateDuration > maxDurationInSeconds;

    if (wouldOverflow) {
      flush();
      bucket = [word];
      continue;
    }

    bucket = candidate;

    if (/[.!?…]$/.test(word.text) && bucket.length >= 2) {
      flush();
    }
  }

  flush();
  return segments;
};

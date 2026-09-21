import { describe, expect, it } from 'vitest';
import { groupSpeechWordsIntoCaptions } from '../lib/autoCaptions';

describe('groupSpeechWordsIntoCaptions', () => {
  it('groups timed words into short readable subtitle segments', () => {
    const segments = groupSpeechWordsIntoCaptions([
      { text: 'Hola', startInSeconds: 0, endInSeconds: 0.35 },
      { text: 'mundo.', startInSeconds: 0.36, endInSeconds: 0.8 },
      { text: 'Esto', startInSeconds: 1.1, endInSeconds: 1.4 },
      { text: 'es', startInSeconds: 1.41, endInSeconds: 1.55 },
      { text: 'Nayla', startInSeconds: 1.56, endInSeconds: 2.05 },
    ]);

    expect(segments).toEqual([
      { text: 'Hola mundo.', start: 0, end: 0.8 },
      { text: 'Esto es Nayla', start: 1.1, end: 2.05 },
    ]);
  });

  it('respects word and duration limits and ignores invalid words', () => {
    const segments = groupSpeechWordsIntoCaptions([
      { text: 'Uno', startInSeconds: 0, endInSeconds: 0.4 },
      { text: 'dos', startInSeconds: 0.5, endInSeconds: 0.9 },
      { text: 'tres', startInSeconds: 1, endInSeconds: 1.4 },
      { text: '', startInSeconds: 1.5, endInSeconds: 1.6 },
      { text: 'cuatro', startInSeconds: 3.5, endInSeconds: 3.9 },
    ], { maxWords: 2, maxDurationInSeconds: 1.5 });

    expect(segments).toEqual([
      { text: 'Uno dos', start: 0, end: 0.9 },
      { text: 'tres', start: 1, end: 1.4 },
      { text: 'cuatro', start: 3.5, end: 3.9 },
    ]);
  });
});

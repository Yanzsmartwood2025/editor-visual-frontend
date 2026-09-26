import { describe, expect, it } from 'vitest';
import {
  fitGeneratedSocialCopy,
  getSocialCopyRule,
  normalizeHashtags,
} from '../lib/social/platformRules';

describe('social platform copy rules', () => {
  it('keeps YouTube titles within the official 100 character limit', () => {
    const result = fitGeneratedSocialCopy({
      platform: 'youtube',
      title: 'x'.repeat(180),
      caption: 'Descripción',
      hashtags: ['#Aria', '#StarlightLog', '#Music', '#AI', '#Rock', '#Extra'],
    });

    expect(result.title).toHaveLength(100);
    expect(result.caption).toBe('Descripción');
    expect(result.hashtags.length).toBeLessThanOrEqual(5);
    expect(getSocialCopyRule('youtube').hardHashtagMax).toBe(60);
  });

  it('fits TikTok copy and normalizes hashtag duplicates', () => {
    const result = fitGeneratedSocialCopy({
      platform: 'tiktok',
      title: 'No debe usarse',
      caption: 'a'.repeat(3000),
      hashtags: ['Aria', '#Aria', 'Starlight Log', '#Rock!'],
    });

    expect(result.title).toBe('');
    expect(result.caption.length).toBeLessThanOrEqual(2200);
    expect(result.hashtags).toEqual(['#Aria', '#StarlightLog', '#Rock']);
  });

  it('does not add hashtags to Reddit by default', () => {
    expect(normalizeHashtags('reddit', ['#Aria', '#Rock'])).toEqual([]);
  });
});

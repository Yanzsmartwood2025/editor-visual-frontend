import { describe, expect, it } from 'vitest';
import { SOCIAL_NETWORKS, getSocialNetwork } from '../lib/social/types';

describe('Nayla Social networks', () => {
  it('keeps network ids unique and exposes the core launch platforms', () => {
    const ids = SOCIAL_NETWORKS.map((network) => network.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'threads', 'linkedin']));
  });

  it('maps provider-specific X and Google Business names without leaking them into the UI id', () => {
    expect(getSocialNetwork('x')?.uploadPostPublish).toBe('twitter');
    expect(getSocialNetwork('x')?.zernio).toBe('twitter');
    expect(getSocialNetwork('google_business')?.zernio).toBe('googlebusiness');
  });

  it('keeps both routes available for the main video networks', () => {
    for (const id of ['instagram', 'tiktok', 'youtube', 'facebook', 'x'] as const) {
      const network = getSocialNetwork(id);
      expect(network?.uploadPostConnect).toBeTruthy();
      expect(network?.zernio).toBeTruthy();
    }
  });
});

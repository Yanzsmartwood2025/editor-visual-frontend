import { afterEach, describe, expect, it } from 'vitest';
import {
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
  createR2StorageUrl,
} from '../lib/r2';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

const configureR2 = () => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'abc123';
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'AKIDEXAMPLE';
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'SECRETEXAMPLE';
  process.env.CLOUDFLARE_R2_BUCKET = 'mybucket';
  process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = 'https://cdn.example.com';
};

describe('R2 presigned URLs', () => {
  it('matches an AWS Signature V4 presigned PUT for R2 path-style S3', () => {
    configureR2();

    const result = createR2PresignedPutUrl({
      key: 'uid/123.mp4',
      contentType: 'video/mp4',
      expiresIn: 900,
      now: new Date('2026-09-19T17:12:23.000Z'),
    });

    expect(result).toEqual({
      key: 'uid/123.mp4',
      url: 'https://cdn.example.com/uid/123.mp4',
      contentType: 'video/mp4',
      expiresIn: 900,
      uploadUrl:
        'https://abc123.r2.cloudflarestorage.com/mybucket/uid/123.mp4?' +
        'X-Amz-Algorithm=AWS4-HMAC-SHA256&' +
        'X-Amz-Credential=AKIDEXAMPLE%2F20260919%2Fauto%2Fs3%2Faws4_request&' +
        'X-Amz-Date=20260919T171223Z&' +
        'X-Amz-Expires=900&' +
        'X-Amz-SignedHeaders=content-type%3Bhost&' +
        'X-Amz-Signature=e17c57a79979c2ecb975210a5110abcb6a18a4872dfb0894f42017aa782896a4',
    });
  });

  it('creates a short-lived signed GET URL for a private object', () => {
    configureR2();

    const result = createR2PresignedGetUrl({
      key: 'uid/123.mp4',
      expiresIn: 900,
      now: new Date('2026-09-19T17:12:23.000Z'),
    });

    expect(result).toEqual({
      key: 'uid/123.mp4',
      expiresIn: 900,
      url:
        'https://abc123.r2.cloudflarestorage.com/mybucket/uid/123.mp4?' +
        'X-Amz-Algorithm=AWS4-HMAC-SHA256&' +
        'X-Amz-Credential=AKIDEXAMPLE%2F20260919%2Fauto%2Fs3%2Faws4_request&' +
        'X-Amz-Date=20260919T171223Z&' +
        'X-Amz-Expires=900&' +
        'X-Amz-SignedHeaders=host&' +
        'X-Amz-Signature=d7f941b101d9c55fb424f8d9cd3c5e059a7cf898b946cce068f8772de4b67e56',
    });

    expect(createR2StorageUrl('uid/123.mp4')).toBe('r2://mybucket/uid/123.mp4');
  });
});

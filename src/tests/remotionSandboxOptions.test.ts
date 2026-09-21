import { describe, expect, it } from 'vitest';
import { VERCEL_SANDBOX_CHROMIUM_OPTIONS } from '../lib/remotionSandboxOptions';

describe('Vercel Sandbox Remotion graphics backend', () => {
  it('uses software ANGLE so WebGL2 effects can render without a physical GPU', () => {
    expect(VERCEL_SANDBOX_CHROMIUM_OPTIONS).toEqual({ gl: 'swangle' });
  });
});

import { describe, expect, it } from 'vitest';
import { parseNaylaDetachedRenderTimings } from '../lib/vercelSandboxRender';

describe('Vercel Sandbox render telemetry', () => {
  it('parses stage timings emitted by the detached runner', () => {
    expect(
      parseNaylaDetachedRenderTimings(
        JSON.stringify({
          renderMs: 412345,
          audioMasterMs: 8432,
          uploadMs: 5180,
          processMs: 426021,
          audioMasterApplied: true,
        })
      )
    ).toEqual({
      renderMs: 412345,
      audioMasterMs: 8432,
      uploadMs: 5180,
      processMs: 426021,
      audioMasterApplied: true,
    });
  });

  it('ignores malformed telemetry instead of failing render polling', () => {
    expect(parseNaylaDetachedRenderTimings('')).toBeUndefined();
    expect(parseNaylaDetachedRenderTimings('not-json')).toBeUndefined();
  });
});

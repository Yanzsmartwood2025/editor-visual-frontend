import { describe, expect, it } from 'vitest';
import { parseNaylaDetachedRenderTimings, parseNaylaRemotionProgressMetrics } from '../lib/vercelSandboxRender';

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


  it('parses Remotion frame and encoding timings', () => {
    expect(
      parseNaylaRemotionProgressMetrics(
        JSON.stringify({
          stage: 'render-progress',
          progress: {
            renderedFrames: 1650,
            encodedFrames: 1650,
            renderedDoneIn: 401234,
            encodedDoneIn: 48765,
            renderEstimatedTime: 0,
            progress: 1,
            stitchStage: 'encoding',
          },
        })
      )
    ).toEqual({
      renderedFrames: 1650,
      encodedFrames: 1650,
      renderedDoneInMs: 401234,
      encodedDoneInMs: 48765,
      renderEstimatedTimeMs: 0,
      stitchStage: 'encoding',
      progress: 1,
    });
  });

  it('ignores malformed telemetry instead of failing render polling', () => {
    expect(parseNaylaDetachedRenderTimings('')).toBeUndefined();
    expect(parseNaylaDetachedRenderTimings('not-json')).toBeUndefined();
    expect(parseNaylaRemotionProgressMetrics('not-json')).toBeUndefined();
  });
});

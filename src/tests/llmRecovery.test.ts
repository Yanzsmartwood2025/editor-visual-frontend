import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeWithRecovery } from '../utils/llmRecovery';

afterEach(() => vi.useRealTimers());
describe('bounded automatic recovery', () => {
  it('waits Retry-After before retrying a rate limit', async () => {
    vi.useFakeTimers();
    const complete = vi.fn().mockRejectedValueOnce({ status: 429, headers: { 'retry-after': '2' } })
      .mockResolvedValue({ text: 'done', truncated: false });
    const result = completeWithRecovery(complete, vi.fn(), { maxTransientRetries: 2 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('done');
  });
  it('cancels a wait without another provider request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const complete = vi.fn().mockRejectedValue({ status: 503 });
    const result = completeWithRecovery(complete, vi.fn(), { signal: controller.signal, maxTransientRetries: 2 });
    const assertion = expect(result).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('cancelled'));
    await assertion;
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('never returns incomplete content after exhausting continuations', async () => {
    const complete = vi.fn().mockResolvedValue({ text: 'partial', truncated: true });
    await expect(completeWithRecovery(complete, vi.fn(), { maxContinuations: 2 })).rejects.toThrow('incompleto');
    expect(complete).toHaveBeenCalledTimes(3);
  });
  it('does not retry authentication failures or ignore a long Retry-After', async () => {
    for (const error of [{ status: 401 }, { status: 429, headers: { 'retry-after': '120' } }]) {
      const complete = vi.fn().mockRejectedValue(error);
      await expect(completeWithRecovery(complete, vi.fn(), { maxTransientRetries: 2 })).rejects.toBe(error);
      expect(complete).toHaveBeenCalledTimes(1);
    }
  });
});

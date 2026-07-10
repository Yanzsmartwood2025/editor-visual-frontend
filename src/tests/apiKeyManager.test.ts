import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncKeyWindows, executeWithApiKey, RateLimitError, ApiKeyRecord } from '../utils/apiKeyManager';
import { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase
const mockUpdate = vi.fn();
const mockEq = vi.fn().mockReturnValue({ data: null, error: null });
const mockSelect = vi.fn();
const mockIlike = vi.fn();
const mockNot = vi.fn();

mockUpdate.mockReturnValue({ eq: mockEq });


const mockOrder = vi.fn().mockReturnValue({ not: mockNot });
const mockEq3 = vi.fn().mockReturnValue({ order: mockOrder });
const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    update: mockUpdate,
    select: mockSelect.mockReturnValue({
      eq: mockEq1,
      ilike: mockIlike.mockReturnValue({
        eq: mockEq.mockReturnValue({
          not: mockNot
        })
      })
    })
  })
} as unknown as SupabaseClient;

describe('apiKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('syncKeyWindows', () => {
    const baseKey: ApiKeyRecord = {
      id: '1',
      api_key: 'test-key',
      service_provider: 'gemini',
      resource_type: 'llm',
      requests_in_current_minute: 5,
      requests_today: 100,
      last_used_at: null,
      minute_window_started_at: '2024-01-02T12:00:00Z',
      day_window_started_at: '2024-01-02T00:00:00Z',
      is_exhausted_today: false,
      rpm_limit: 10,
      rpd_limit: 250
    };

    it('should not reset windows if still within time limits', async () => {
      // 30 seconds later
      vi.setSystemTime(new Date('2024-01-02T12:00:30Z'));

      const updatedKey = await syncKeyWindows(mockSupabase, { ...baseKey });

      expect(updatedKey.requests_in_current_minute).toBe(5);
      expect(updatedKey.requests_today).toBe(100);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reset minute window after 60 seconds', async () => {
      // 61 seconds later
      vi.setSystemTime(new Date('2024-01-02T12:01:01Z'));

      const updatedKey = await syncKeyWindows(mockSupabase, { ...baseKey });

      expect(updatedKey.requests_in_current_minute).toBe(0);
      expect(updatedKey.minute_window_started_at).toBe('2024-01-02T12:01:01.000Z');
      expect(updatedKey.requests_today).toBe(100); // Day limit shouldn't reset

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        requests_in_current_minute: 0,
        minute_window_started_at: '2024-01-02T12:01:01.000Z'
      }));
    });

    it('should reset day window on a new day', async () => {
      // Next day
      vi.setSystemTime(new Date('2024-01-03T01:00:00Z'));

      // We set a key that was exhausted yesterday
      const keyExhaustedYesterday = {
        ...baseKey,
        requests_today: 250,
        is_exhausted_today: true
      };

      const updatedKey = await syncKeyWindows(mockSupabase, keyExhaustedYesterday);

      expect(updatedKey.requests_today).toBe(0);
      expect(updatedKey.is_exhausted_today).toBe(false);
      expect(updatedKey.day_window_started_at).toBe('2024-01-03T01:00:00.000Z');

      // Minute window should also reset since it's definitely been > 60s
      expect(updatedKey.requests_in_current_minute).toBe(0);

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        requests_today: 0,
        is_exhausted_today: false
      }));
    });
  });

  describe('executeWithApiKey', () => {
    const keys: ApiKeyRecord[] = [
      { id: '1', api_key: 'key-1', service_provider: 'gemini', resource_type: 'llm', requests_in_current_minute: 9, requests_today: 50, last_used_at: null, minute_window_started_at: '2024-01-02T12:00:00Z', day_window_started_at: '2024-01-02T00:00:00Z', is_exhausted_today: false, rpm_limit: 10, rpd_limit: 250, character_name: 'arIA' },
      { id: '2', api_key: 'key-2', service_provider: 'gemini', resource_type: 'llm', requests_in_current_minute: 2, requests_today: 50, last_used_at: null, minute_window_started_at: '2024-01-02T12:00:00Z', day_window_started_at: '2024-01-02T00:00:00Z', is_exhausted_today: false, rpm_limit: 10, rpd_limit: 250, character_name: 'Nayla_1' },
      { id: '3', api_key: 'key-3', service_provider: 'gemini', resource_type: 'llm', requests_in_current_minute: 5, requests_today: 50, last_used_at: null, minute_window_started_at: '2024-01-02T12:00:00Z', day_window_started_at: '2024-01-02T00:00:00Z', is_exhausted_today: false, rpm_limit: 10, rpd_limit: 250, character_name: 'Nayla_2' },
    ];

    it('should select the key with the lowest requests_in_current_minute', async () => {
      mockNot.mockResolvedValueOnce({ data: keys, error: null });

      const action = vi.fn().mockResolvedValue('success');

      await executeWithApiKey(mockSupabase, "gemini", action);

      // key-2 has the lowest usage (2)
      expect(action).toHaveBeenCalledWith('key-2');

      // Should update the counters for key-2
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        requests_in_current_minute: 3,
        requests_today: 51
      }));
      expect(mockEq).toHaveBeenCalledWith('id', '2');
    });

    it('should filter out exhausted keys (RPM limit hit)', async () => {
      const mixedKeys = [
        ...keys,
        { id: '4', api_key: 'key-4', service_provider: 'gemini', resource_type: 'llm', requests_in_current_minute: 10, requests_today: 50, last_used_at: null, minute_window_started_at: '2024-01-02T12:00:00Z', day_window_started_at: '2024-01-02T00:00:00Z', is_exhausted_today: false, rpm_limit: 10, rpd_limit: 250 }
      ];
      mockNot.mockResolvedValueOnce({ data: mixedKeys, error: null });

      // Make key-2 and key-3 hit 429 RPM limit to force it to try the rest
      const action = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('RPM Hit', false)) // fails key-2
        .mockRejectedValueOnce(new RateLimitError('RPM Hit', false)) // fails key-3
        .mockResolvedValueOnce('success'); // succeeds on key-1

      await executeWithApiKey(mockSupabase, "gemini", action);

      // Should have skipped key-4 entirely before calling action because it had 10 >= rpm_limit
      expect(action).not.toHaveBeenCalledWith('key-4');

      // Should have called key-2 (lowest, 2), then key-3 (5), then key-1 (9)
      expect(action).toHaveBeenNthCalledWith(1, 'key-2');
      expect(action).toHaveBeenNthCalledWith(2, 'key-3');
      expect(action).toHaveBeenNthCalledWith(3, 'key-1');
    });

    it('should mark key as exhausted today if daily rate limit is hit', async () => {
      mockNot.mockResolvedValueOnce({ data: keys, error: null });

      const action = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('Quota Exceeded', true)) // fails key-2 (Daily)
        .mockResolvedValueOnce('success'); // succeeds on key-3

      await executeWithApiKey(mockSupabase, "gemini", action);

      // Verify key-2 was marked exhausted in DB
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        is_exhausted_today: true
      }));
      expect(mockEq).toHaveBeenCalledWith('id', '2');

      // Verify key-3 succeeded and counters incremented
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        requests_in_current_minute: 6,
        requests_today: 51
      }));
      expect(mockEq).toHaveBeenCalledWith('id', '3');
    });

    it('should throw error if all keys fail with rate limit and no fallback is provided', async () => {
      mockNot.mockResolvedValueOnce({ data: keys, error: null });

      const action = vi.fn().mockRejectedValue(new RateLimitError('RPM Hit', false));

      await expect(executeWithApiKey(mockSupabase, "gemini", action)).rejects.toThrow('Límite de gemini alcanzado en todas las cuentas disponibles, intenta en unos minutos.');
    });

    it('should execute fallback if all keys fail and fallback is provided', async () => {
       mockNot.mockResolvedValueOnce({ data: keys, error: null });
       const action = vi.fn().mockRejectedValue(new RateLimitError('RPM Hit', false));
       const fallback = vi.fn().mockResolvedValue('fallback_success');

       const result = await executeWithApiKey(mockSupabase, "gemini", action, fallback);
       expect(result).toBe('fallback_success');
       expect(fallback).toHaveBeenCalled();
    });
  });
});

import { SupabaseClient } from '@supabase/supabase-js';

export interface ApiKeyRecord {
  id: string;
  api_key: string;
  service_provider: string;
  resource_type: string;
  requests_in_current_minute: number;
  requests_today: number;
  last_used_at: string | null;
  minute_window_started_at: string | null;
  day_window_started_at: string | null;
  is_exhausted_today: boolean;
  rpm_limit: number;
  rpd_limit: number;
  character_name?: string;
}

/**
 * Checks and resets time windows for a given key locally.
 * If updates are needed, it optionally updates them in the DB immediately.
 */
export async function syncKeyWindows(supabase: SupabaseClient, key: ApiKeyRecord): Promise<ApiKeyRecord> {
  const now = new Date();
  let needsUpdate = false;
  const updatedKey = { ...key };

  // Check Minute Window
  if (key.minute_window_started_at) {
    const minuteStart = new Date(key.minute_window_started_at);
    const diffSeconds = (now.getTime() - minuteStart.getTime()) / 1000;
    if (diffSeconds >= 60) {
      updatedKey.requests_in_current_minute = 0;
      updatedKey.minute_window_started_at = now.toISOString();
      needsUpdate = true;
    }
  } else {
    updatedKey.minute_window_started_at = now.toISOString();
    updatedKey.requests_in_current_minute = 0;
    needsUpdate = true;
  }

  // Check Day Window
  if (key.day_window_started_at) {
    const dayStart = new Date(key.day_window_started_at);
    // Compare YYYY-MM-DD
    if (dayStart.getUTCFullYear() !== now.getUTCFullYear() ||
        dayStart.getUTCMonth() !== now.getUTCMonth() ||
        dayStart.getUTCDate() !== now.getUTCDate()) {
      updatedKey.requests_today = 0;
      updatedKey.is_exhausted_today = false;
      updatedKey.day_window_started_at = now.toISOString();
      needsUpdate = true;
    }
  } else {
    updatedKey.day_window_started_at = now.toISOString();
    updatedKey.requests_today = 0;
    updatedKey.is_exhausted_today = false;
    needsUpdate = true;
  }

  if (needsUpdate && key.id) {
    await supabase.from('api_keys_pool').update({
      requests_in_current_minute: updatedKey.requests_in_current_minute,
      minute_window_started_at: updatedKey.minute_window_started_at,
      requests_today: updatedKey.requests_today,
      day_window_started_at: updatedKey.day_window_started_at,
      is_exhausted_today: updatedKey.is_exhausted_today
    }).eq('id', key.id);
  }

  return updatedKey;
}

/**
 * Custom Error to distinguish Rate Limit vs other errors.
 */
export class RateLimitError extends Error {
  isDailyLimit: boolean;
  constructor(message: string, isDailyLimit: boolean = false) {
    super(message);
    this.name = 'RateLimitError';
    this.isDailyLimit = isDailyLimit;
  }
}

/**
 * Executes a function with the best available Gemini API key, handling limits, resets, and retries.
 */
export async function executeWithApiKey<T>(
  supabase: SupabaseClient,
  provider: string,
  action: (apiKey: string) => Promise<T>,
  fallbackAction?: () => Promise<T>
): Promise<T> {
  const { data: keysData, error: keysError } = await supabase
    .from('api_keys_pool')
    .select('*')
    .ilike('service_provider', `%${provider}%`)
    .eq('is_active', true)
    .eq('resource_type', 'llm')
    .order('created_at', { ascending: false })
    .not('api_key', 'is', null);

  let candidateKeys: ApiKeyRecord[] = [];

  if (!keysError && keysData && keysData.length > 0) {
    // 1. Sync windows and filter out invalid/exhausted keys
    for (const rawKey of keysData) {
      if (!rawKey.api_key || rawKey.api_key.trim() === '') continue;

      const key = await syncKeyWindows(supabase, rawKey as ApiKeyRecord);

      if (
        key.is_exhausted_today ||
        key.requests_today >= (key.rpd_limit || 250) ||
        key.requests_in_current_minute >= (key.rpm_limit || 10)
      ) {
        continue; // Discard exhausted key
      }

      candidateKeys.push(key);
    }
  }

  // Sort by lowest recent usage (requests_in_current_minute ASC)
  candidateKeys.sort((a, b) => a.requests_in_current_minute - b.requests_in_current_minute);

  if (candidateKeys.length === 0) {
    if (fallbackAction) {
      console.warn('[executeWithApiKey] No available keys found, trying fallback.');
      return await fallbackAction();
    }
    throw new Error(`Límite de ${provider} alcanzado en todas las cuentas disponibles, intenta en unos minutos.`);
  }

  // 2. Try keys in order
  for (const key of candidateKeys) {
    try {
      // Execute the provided action
      const result = await action(key.api_key);

      // On success, update counters
      await supabase.from('api_keys_pool').update({
        requests_in_current_minute: key.requests_in_current_minute + 1,
        requests_today: key.requests_today + 1,
        last_used_at: new Date().toISOString()
      }).eq('id', key.id);

      return result;

    } catch (error: any) {
      // Check if it's a 429 Rate Limit error
      if (error instanceof RateLimitError || error?.status === 429 || error?.response?.status === 429 || error?.message?.includes('429')) {
        console.warn(`[executeWithApiKey] Key ${key.character_name || key.id} hit rate limit (429). Retrying...`);

        // Determine if daily or minute based on error message or explicit flag
        const isDaily = (error instanceof RateLimitError && error.isDailyLimit) ||
                        error?.message?.toLowerCase().includes('quota') ||
                        error?.message?.toLowerCase().includes('daily');

        if (isDaily) {
          // Mark daily exhaustion
          await supabase.from('api_keys_pool').update({
            is_exhausted_today: true,
            last_used_at: new Date().toISOString()
          }).eq('id', key.id);
        } else {
          // Just update last used so we know we tried it
           await supabase.from('api_keys_pool').update({
            last_used_at: new Date().toISOString()
          }).eq('id', key.id);
        }

        continue; // Try next key
      }

      // If it's a different error, propagate it (e.g. 500 server error, bad request, etc.)
      throw error;
    }
  }

  // If we exhaust all candidate keys via 429s
  if (fallbackAction) {
    console.warn('[executeWithApiKey] All candidate keys hit 429, trying fallback.');
    return await fallbackAction();
  }
  throw new Error(`Límite de ${provider} alcanzado en todas las cuentas disponibles, intenta en unos minutos.`);
}


/**
 * Logs an AI Rate Limit error to the database.
 */
export async function logAiRateLimitError(supabase: SupabaseClient, provider: string, errorMessage: string): Promise<void> {
  try {
    await supabase.from('ai_operation_logs').insert({
      provider,
      error_message: errorMessage
    });
  } catch (err) {
    console.error('[logAiRateLimitError] Failed to log error:', err);
  }
}

export type RecoveryOptions = {
  signal?: AbortSignal;
  maxContinuations?: number;
  maxTransientRetries?: number;
};

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal?.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

// A single request budget covers retries and continuations. Never return a partial plan.
export async function completeWithRecovery(
  complete: () => Promise<{ text: string; truncated: boolean }>,
  continueFrom: (partial: string) => void,
  options: RecoveryOptions = {},
): Promise<string> {
  let text = '';
  let continuations = 0;
  let retries = 0;
  const signal = options.signal ?? AbortSignal.timeout(180_000);
  for (;;) {
    signal.throwIfAborted();
    let result;
    try {
      result = await complete();
    } catch (error: any) {
      signal.throwIfAborted();
      const status = Number(error?.status ?? error?.statusCode);
      if (![408, 429, 500, 502, 503, 504].includes(status) || retries >= (options.maxTransientRetries ?? 0)) throw error;
      const header = error?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after'] ?? error?.rawResponse?.headers?.get?.('retry-after');
      const seconds = Number(header);
      const requested = header == null ? NaN : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
      // Do not retry earlier than the provider requests. Long waits need a durable job.
      if (Number.isFinite(requested) && requested > 30_000) throw error;
      await wait(Math.max(0, Number.isFinite(requested) ? requested : 1000 * 2 ** retries), signal);
      retries += 1;
      continue;
    }
    text += result.text;
    if (!result.truncated) return text;
    if (!result.text || continuations >= (options.maxContinuations ?? 0)) {
      throw new Error('La respuesta del modelo superó el límite de salida. El plan incompleto no se enviará.');
    }
    continuations += 1;
    continueFrom(result.text);
  }
}

import { useEffect } from 'react';
import type { FirebaseSession } from '../../lib/firebaseClient';

const asMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || 'Error desconocido');
  }
};

export default function DiagnosticsClientReporter({ session }: { session: FirebaseSession | null }) {
  useEffect(() => {
    if (!session?.accessToken || typeof window === 'undefined') return;

    const recent = new Map<string, number>();

    const report = (title: string, message: string, details: Record<string, unknown> = {}) => {
      const cleanMessage = message.slice(0, 1800);
      const key = `${title}:${cleanMessage}`;
      const now = Date.now();
      const last = recent.get(key) || 0;
      if (now - last < 30_000) return;
      recent.set(key, now);

      void fetch('/api/diagnostics/client-event', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, message: cleanMessage, details }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const onError = (event: ErrorEvent) => {
      report('Error del navegador', event.message || event.error?.message || 'Error no controlado', {
        source: event.filename ? 'browser-script' : 'browser',
        line: event.lineno || null,
        column: event.colno || null,
      });
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      report('Promesa rechazada', asMessage(event.reason), { source: 'unhandledrejection' });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, [session?.accessToken]);

  return null;
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { getDiagnosticSnapshot } from '../../../lib/diagnosticStore';
import { isDiagnosticsAdmin } from '../../../lib/diagnostics';

export const config = {
  maxDuration: 60,
};

const encode = (event: string, payload: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const identity = await requireFirebaseUser(req);
    if (!isDiagnosticsAdmin(identity.email || null)) return res.status(403).end();
  } catch {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  let lastSerialized = '';
  const sendSnapshot = async () => {
    try {
      const snapshot = await getDiagnosticSnapshot(50);
      const serialized = JSON.stringify(snapshot);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        res.write(encode('snapshot', snapshot));
      } else {
        res.write(encode('ping', { at: new Date().toISOString() }));
      }
    } catch (error: any) {
      res.write(encode('stream-error', { message: error?.message || 'No se pudo leer diagnóstico.' }));
    }
  };

  await sendSnapshot();

  const interval = setInterval(() => {
    if (!closed) void sendSnapshot();
  }, 2500);

  const timeout = setTimeout(() => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    res.write(encode('reconnect', { at: new Date().toISOString() }));
    res.end();
  }, 50_000);

  req.on('close', () => {
    closed = true;
    clearInterval(interval);
    clearTimeout(timeout);
  });
}

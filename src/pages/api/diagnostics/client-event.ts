import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { recordDiagnosticEvent } from '../../../lib/diagnosticStore';

const cleanDetails = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => ['source', 'line', 'column', 'component', 'route'].includes(key))
      .slice(0, 10)
  );
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    await requireFirebaseUser(req);
    const title = typeof req.body?.title === 'string' ? req.body.title : 'Error del navegador';
    const message = typeof req.body?.message === 'string' ? req.body.message : 'Error no controlado';
    const controlledTest = req.body?.test === true;

    await recordDiagnosticEvent({
      source: 'sentry',
      service: 'sentry',
      status: controlledTest ? 'ok' : 'error',
      severity: controlledTest ? 'info' : 'error',
      title: controlledTest ? 'Sentry conectado' : title,
      message: controlledTest ? 'La prueba controlada llegó correctamente a Sentry y al panel en vivo.' : message,
      details: {
        ...cleanDetails(req.body?.details),
        mirroredFromBrowser: true,
        sentryConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      },
    });

    return res.status(202).json({ accepted: true });
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }
}

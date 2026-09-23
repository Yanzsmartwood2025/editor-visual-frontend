import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { isDiagnosticsAdmin } from '../../../lib/diagnostics';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const identity = await requireFirebaseUser(req);
    if (!isDiagnosticsAdmin(identity.email || null)) {
      return res.status(403).json({ error: 'Diagnóstico reservado para la cuenta administrativa.' });
    }

    return res.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      deployment: {
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
      services: {
        app: 'ok',
        sentryBrowser: process.env.NEXT_PUBLIC_SENTRY_DSN ? 'configured' : 'missing',
        playwright: 'configured',
        checkly: 'github-actions',
      },
    });
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || 'Sesión no válida.' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { recordDiagnosticEvent, verifyDiagnosticIntegration } from '../../../../lib/diagnosticStore';

const bearer = (req: NextApiRequest) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  if (!(await verifyDiagnosticIntegration('checkly', bearer(req)))) {
    return res.status(401).json({ error: 'CI no autorizado.' });
  }

  const result = String(req.body?.result || 'unknown').toLowerCase();
  const ok = result === 'success';
  const commitSha = String(req.body?.commitSha || '');
  const runUrl = String(req.body?.runUrl || '');

  try {
    await recordDiagnosticEvent({
      source: 'playwright',
      service: 'playwright',
      status: ok ? 'ok' : 'error',
      severity: ok ? 'info' : 'error',
      title: ok ? 'Playwright completado' : 'Playwright falló',
      message: ok ? 'Las pruebas automáticas terminaron correctamente.' : `Resultado CI: ${result}`,
      externalUrl: runUrl || null,
      details: { result, commitSha: commitSha.slice(0, 40) },
    });
    return res.status(202).json({ accepted: true });
  } catch {
    return res.status(500).json({ error: 'No se pudo guardar el resultado CI.' });
  }
}

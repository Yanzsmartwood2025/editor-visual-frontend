import type { NextApiRequest, NextApiResponse } from 'next';
import { registerDiagnosticIntegration } from '../../../../lib/diagnosticStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
  const callbackSecret = typeof req.body?.callbackSecret === 'string' ? req.body.callbackSecret : '';

  if (!apiKey || !accountId || callbackSecret.length < 32) {
    return res.status(400).json({ error: 'Registro incompleto.' });
  }

  try {
    const verify = await fetch('https://api.checklyhq.com/v1/checks?limit=1', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Checkly-Account': accountId,
        Accept: 'application/json',
      },
    });

    if (!verify.ok) return res.status(403).json({ error: 'Credenciales de Checkly no válidas.' });

    await registerDiagnosticIntegration({
      provider: 'checkly',
      secret: callbackSecret,
      metadata: { accountId, registeredAt: new Date().toISOString() },
    });

    return res.status(200).json({ registered: true });
  } catch {
    return res.status(502).json({ error: 'No se pudo validar Checkly.' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { recordDiagnosticEvent, verifyDiagnosticIntegration } from '../../../../lib/diagnosticStore';

const bearer = (req: NextApiRequest) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

const mapAlert = (type: string) => {
  const normalized = type.toUpperCase();
  if (normalized.includes('RECOVERY')) return { status: 'recovered' as const, severity: 'info' as const };
  if (normalized.includes('DEGRADED')) return { status: 'degraded' as const, severity: 'warning' as const };
  if (normalized.includes('FAILURE') || normalized.includes('FAILED')) return { status: 'error' as const, severity: 'error' as const };
  return { status: 'info' as const, severity: 'info' as const };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  if (!(await verifyDiagnosticIntegration('checkly', bearer(req)))) {
    return res.status(401).json({ error: 'Webhook no autorizado.' });
  }

  const alertType = String(req.body?.alertType || req.body?.ALERT_TYPE || 'INFO');
  const checkName = String(req.body?.checkName || req.body?.CHECK_NAME || 'Checkly');
  const title = String(req.body?.title || req.body?.ALERT_TITLE || checkName);
  const resultLink = String(req.body?.resultLink || req.body?.RESULT_LINK || '');
  const mapped = mapAlert(alertType);

  try {
    await recordDiagnosticEvent({
      source: 'checkly',
      service: 'checkly',
      status: mapped.status,
      severity: mapped.severity,
      title: title.slice(0, 220),
      message: `${checkName}: ${alertType}`,
      externalUrl: resultLink || null,
      details: { alertType, checkName },
    });
    return res.status(202).json({ accepted: true });
  } catch {
    return res.status(500).json({ error: 'No se pudo guardar el evento.' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser, type FirebaseIdentity } from '../firebaseAdmin';

export const requireSocialUser = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<FirebaseIdentity | null> => {
  try {
    return await requireFirebaseUser(req);
  } catch {
    res.status(401).json({ error: 'Token Firebase inválido.' });
    return null;
  }
};

export const requestOrigin = (req: NextApiRequest) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    try {
      return new URL(origin).origin;
    } catch {}
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) throw new Error('No se pudo determinar el dominio de retorno.');
  return `${forwardedProto}://${host}`;
};

import type { NextApiRequest } from 'next';

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const resolveRequestPublicBaseUrl = (req: NextApiRequest) => {
  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionDomain) {
    return 'https://' + productionDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https:\/\//i.test(configured)) {
    return configured.replace(/\/$/, '');
  }

  const proto = firstHeader(req.headers['x-forwarded-proto']) || 'https';
  const host =
    firstHeader(req.headers['x-forwarded-host']) ||
    firstHeader(req.headers.host);

  if (!host) throw new Error('No se pudo determinar la URL pública de Nayla.');
  if (proto !== 'https' && process.env.NODE_ENV === 'production') {
    throw new Error('La URL pública de Nayla debe usar HTTPS.');
  }

  return proto + '://' + host;
};

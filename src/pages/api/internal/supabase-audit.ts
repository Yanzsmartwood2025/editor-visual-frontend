import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let projectRef: string | null = null;

  try {
    projectRef = url ? new URL(url).hostname.split('.')[0] || null : null;
  } catch {
    projectRef = null;
  }

  res.status(200).json({
    supabaseUrl: url || null,
    projectRef,
    anonKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}

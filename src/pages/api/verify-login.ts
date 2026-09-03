import { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser, setAuthenticatedRole } from '../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const user = await requireFirebaseUser(req);
    await setAuthenticatedRole(user.uid);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
}

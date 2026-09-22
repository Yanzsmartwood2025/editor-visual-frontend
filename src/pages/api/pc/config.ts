import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  getDefaultNaylaPcProfile,
  saveDefaultNaylaPcProfile,
} from '../../../lib/pc/store';

const toPublicProfile = (profile: Awaited<ReturnType<typeof getDefaultNaylaPcProfile>>) => {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    osFamily: profile.os_family,
    cpu: profile.cpu,
    ramGb: profile.ram_gb,
    diskGb: profile.disk_gb,
    gpuEnabled: profile.gpu_enabled,
    minGpuVramGb: profile.min_gpu_vram_gb,
    billingMode: profile.billing_mode,
    durationHours: profile.duration_hours,
    autoDestroy: profile.auto_destroy,
    status: profile.status,
    updatedAt: profile.updated_at,
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  try {
    if (req.method === 'GET') {
      const profile = await getDefaultNaylaPcProfile(user.uid);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({ profile: toPublicProfile(profile) });
    }

    if (req.method === 'PUT') {
      const profile = await saveDefaultNaylaPcProfile({
        userId: user.uid,
        input: req.body || {},
      });
      return res.status(200).json({ profile: toPublicProfile(profile) });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo guardar la configuración de Nayla PC.';
    return res.status(500).json({ error: message });
  }
}

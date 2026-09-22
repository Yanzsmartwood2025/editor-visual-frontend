import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  buildNaylaPcRuntimeUserData,
  createVultrInstanceFromSnapshot,
  deleteVultrInstance,
  findVultrInstanceByLabel,
  getVultrInstance,
  probeNaylaPcDesktop,
} from '../../../lib/gpu/vultrApi';
import {
  getAvailableNaylaPcBaseImage,
  getNaylaInternalSecret,
} from '../../../lib/pc/store';

const LABEL = 'nayla-pc-v3-smoke';

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const provided = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const expected = await getNaylaInternalSecret('pc_base_builder');
  if (!provided || !expected || !safeEqual(provided, expected)) {
    return res.status(404).json({ error: 'No disponible.' });
  }

  const action =
    typeof req.query.action === 'string'
      ? req.query.action.trim().toLowerCase()
      : 'status';

  try {
    const existing = await findVultrInstanceByLabel(LABEL);

    if (action === 'cleanup') {
      if (existing?.id) await deleteVultrInstance(existing.id);
      const after = await findVultrInstanceByLabel(LABEL);
      return res.status(200).json({
        ok: true,
        state: after ? 'cleanup_pending' : 'cleaned',
        providerInstancePresent: Boolean(after),
      });
    }

    if (action === 'start') {
      if (existing?.id) {
        return res.status(200).json({
          ok: true,
          state: 'existing',
          provider: {
            id: existing.id,
            status: existing.status,
            powerStatus: existing.power_status,
            createdAt: existing.date_created,
          },
        });
      }

      const base = await getAvailableNaylaPcBaseImage('linux');
      if (!base || base.version !== 'ubuntu-26.04-xfce-v3') {
        return res.status(409).json({ error: 'Nayla Base v3 no está disponible.' });
      }

      const desktopPassword = randomBytes(6)
        .toString('base64url')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 8)
        .padEnd(8, '7');

      const userData = buildNaylaPcRuntimeUserData({
        desktopPassword,
        driveToken: 'smoke-disabled-' + randomBytes(8).toString('hex'),
        instanceId: 'nayla-v3-smoke',
        driveApiBaseUrl:
          'https://editor-visual-frontend-cauc.vercel.app/api/pc/drive/agent',
      });

      const provider = await createVultrInstanceFromSnapshot({
        planId: base.provider_plan_id,
        regionId: base.provider_region_id,
        snapshotId: base.provider_snapshot_id,
        label: LABEL,
        userData,
      });

      return res.status(201).json({
        ok: true,
        state: 'starting',
        provider: {
          id: provider.id,
          status: provider.status,
          powerStatus: provider.power_status,
          createdAt: provider.date_created,
        },
      });
    }

    if (!existing?.id) {
      return res.status(200).json({ ok: true, state: 'absent' });
    }

    const live = await getVultrInstance(existing.id);
    if (!live) return res.status(200).json({ ok: true, state: 'absent' });

    const desktopReady =
      Boolean(live.main_ip && live.main_ip !== '0.0.0.0') &&
      (await probeNaylaPcDesktop(live.main_ip, 6080).catch(() => false));

    return res.status(200).json({
      ok: true,
      state: desktopReady ? 'ready' : 'starting',
      desktopReady,
      provider: {
        id: live.id,
        status: live.status,
        powerStatus: live.power_status,
        serverStatus: live.server_status,
        createdAt: live.date_created,
        pendingCharges: live.pending_charges,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falló el smoke de Nayla Base v3.',
    });
  }
}

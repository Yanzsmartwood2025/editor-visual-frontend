import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../../lib/firebaseAdmin';
import {
  applyNaylaPcAction,
  saveAndDestroyNaylaPcInstance,
  syncNaylaPcInstance,
  terminateNaylaPcInstance,
  toPublicNaylaPcInstance,
  toPublicNaylaPcSnapshot,
} from '../../../../lib/pc/instances';
import { getNaylaPcInstanceForUser } from '../../../../lib/pc/store';

const validActions = new Set(['start', 'stop', 'reboot', 'destroy', 'save_destroy']);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const instanceId =
    typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!instanceId) {
    return res.status(400).json({ error: 'Instancia inválida.' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const found = await getNaylaPcInstanceForUser({
      userId: user.uid,
      instanceId,
    });

    if (!found) {
      return res.status(404).json({ error: 'Nayla PC no existe.' });
    }

    const synced = await syncNaylaPcInstance(found);

    if (req.method === 'GET') {
      return res.status(200).json({
        instance: toPublicNaylaPcInstance(synced),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido.' });
    }

    const action = String(req.body?.action || '').toLowerCase();
    if (!validActions.has(action)) {
      return res.status(400).json({ error: 'Acción de PC no válida.' });
    }

    if (
      (action === 'destroy' || action === 'save_destroy') &&
      req.body?.confirmDestroy !== true
    ) {
      return res.status(400).json({
        error: 'Debes confirmar la eliminación permanente de la PC.',
      });
    }

    const expired =
      synced.auto_destroy &&
      synced.expires_at &&
      Date.parse(synced.expires_at) <= Date.now();

    if (expired && action !== 'destroy') {
      const terminated = await terminateNaylaPcInstance({
        row: synced,
        reason: 'hourly_lease_expired',
      });
      return res.status(409).json({
        code: 'LEASE_EXPIRED',
        error: 'El tiempo contratado terminó y la PC fue eliminada.',
        instance: toPublicNaylaPcInstance(terminated),
      });
    }

    if (synced.status === 'terminated') {
      return res.status(409).json({
        error: 'Esta PC ya fue eliminada.',
        instance: toPublicNaylaPcInstance(synced),
      });
    }

    if (action === 'save_destroy') {
      const saved = await saveAndDestroyNaylaPcInstance({ row: synced });
      return res.status(202).json({
        instance: toPublicNaylaPcInstance(saved.instance),
        snapshot: toPublicNaylaPcSnapshot(saved.snapshot),
        message:
          'Nayla está guardando el disco completo. La VM se destruirá automáticamente cuando el snapshot esté listo.',
      });
    }

    const updated = await applyNaylaPcAction({
      row: synced,
      action: action as 'start' | 'stop' | 'reboot' | 'destroy',
    });

    return res.status(200).json({
      instance: toPublicNaylaPcInstance(updated),
      billingWarning:
        action === 'stop'
          ? 'Apagar conserva la máquina y el cobro continúa hasta destruirla.'
          : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo controlar Nayla PC.';
    return res.status(500).json({ error: message });
  }
}

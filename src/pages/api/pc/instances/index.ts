import { randomBytes } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  isFirebaseAdmin,
  requireFirebaseUser,
} from '../../../../lib/firebaseAdmin';
import {
  buildNaylaPcDesktopUserData,
  createVultrInstance,
  deleteVultrInstance,
  findVultrInstanceByLabel,
} from '../../../../lib/gpu/vultrApi';
import {
  resolveNaylaPcSelection,
  type NaylaPcRequest,
} from '../../../../lib/pc/quote';
import {
  createNaylaPcProvisioningInstance,
  getActiveNaylaPcInstance,
  getDefaultNaylaPcProfile,
  patchNaylaPcInstance,
} from '../../../../lib/pc/store';
import {
  syncNaylaPcInstance,
  toPublicNaylaPcInstance,
} from '../../../../lib/pc/instances';

const envNumber = (key: string, fallback: number) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const maxSessionUsd = () => envNumber('NAYLA_PC_MAX_SESSION_USD', 100);
const maxMonthlyUsd = () => envNumber('NAYLA_PC_MAX_MONTHLY_USD', 750);
const leaseSafetySeconds = () =>
  Math.min(300, Math.max(30, envNumber('NAYLA_PC_LEASE_SAFETY_SECONDS', 90)));

const sameMoney = (a: unknown, b: number) => {
  const value = Number(a);
  return Number.isFinite(value) && Math.abs(value - b) <= 0.0005;
};

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

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'GET') {
    try {
      const active = await getActiveNaylaPcInstance(user.uid);
      if (!active) {
        return res.status(200).json({
          instance: null,
          provisioningAllowed: isFirebaseAdmin(user),
        });
      }

      const synced = await syncNaylaPcInstance(active);
      if (synced.status === 'terminated') {
        return res.status(200).json({
          instance: null,
          provisioningAllowed: isFirebaseAdmin(user),
        });
      }

      return res.status(200).json({
        instance: toPublicNaylaPcInstance(synced),
        provisioningAllowed: isFirebaseAdmin(user),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo consultar Nayla PC.';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!isFirebaseAdmin(user)) {
    return res.status(403).json({
      code: 'PILOT_ONLY',
      error:
        'La creación real de Nayla PC está en piloto privado hasta conectar el cobro al cliente. Puedes cotizar y guardar configuraciones normalmente.',
    });
  }

  const body = req.body || {};
  const config = (body.config || {}) as Partial<NaylaPcRequest>;
  const selectionId = String(body.selectionId || '').trim();
  const confirmation = body.confirmation || {};

  if (!selectionId || confirmation.accepted !== true) {
    return res.status(400).json({
      error: 'Debes confirmar la oferta y el costo antes de crear la PC.',
    });
  }

  let pendingId = '';
  let label = '';
  let providerInstanceId = '';

  try {
    const existing = await getActiveNaylaPcInstance(user.uid);
    if (existing) {
      return res.status(409).json({
        code: 'ACTIVE_INSTANCE_EXISTS',
        error: 'Ya tienes una Nayla PC activa o en proceso.',
        instance: toPublicNaylaPcInstance(existing),
      });
    }

    const resolved = await resolveNaylaPcSelection({
      rawInput: config,
      selectionId,
    });

    if (resolved.request.osFamily === 'windows') {
      return res.status(422).json({
        code: 'WINDOWS_LICENSE_PENDING',
        error:
          'Windows todavía está en vista previa porque falta integrar el cargo exacto de licencia. Linux ya puede crearse de forma real.',
      });
    }

    if (resolved.request.gpuEnabled) {
      return res.status(422).json({
        code: 'GPU_DESKTOP_PENDING',
        error:
          'La PC con GPU todavía está en vista previa mientras terminamos la imagen con controladores gráficos. La PC Linux sin GPU ya puede crearse.',
      });
    }

    const pricesMatch =
      sameMoney(confirmation.hourlyPrice, resolved.card.hourlyPrice) &&
      sameMoney(confirmation.monthlyPrice, resolved.card.monthlyPrice) &&
      sameMoney(
        confirmation.sessionPrice,
        resolved.card.estimatedSessionPrice
      );

    if (!pricesMatch) {
      return res.status(409).json({
        code: 'PRICE_CHANGED',
        refreshRequired: true,
        error:
          'El precio cambió desde tu última cotización. Actualiza antes de confirmar.',
        current: resolved.card,
      });
    }

    if (
      resolved.request.billingMode === 'hourly' &&
      resolved.card.estimatedSessionPrice > maxSessionUsd()
    ) {
      return res.status(422).json({
        code: 'SPEND_GUARD',
        error:
          'Esta sesión supera el límite de seguridad de Nayla PC. Reduce potencia o duración.',
      });
    }

    if (
      resolved.request.billingMode === 'monthly' &&
      resolved.card.monthlyPrice > maxMonthlyUsd()
    ) {
      return res.status(422).json({
        code: 'SPEND_GUARD',
        error:
          'Esta configuración supera el límite mensual de seguridad de Nayla PC.',
      });
    }

    const profile = await getDefaultNaylaPcProfile(user.uid);
    const desktopPassword = randomBytes(6)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .padEnd(8, '7');
    const desktopUserData = buildNaylaPcDesktopUserData({ desktopPassword });
    const autoDestroy = resolved.request.billingMode === 'hourly';
    const expiresAt = autoDestroy
      ? new Date(
          Date.now() +
            resolved.request.durationHours * 60 * 60 * 1000 -
            leaseSafetySeconds() * 1000
        ).toISOString()
      : null;

    const pending = await createNaylaPcProvisioningInstance({
      userId: user.uid,
      profileId: profile?.id || null,
      providerPlanId: resolved.plan.id,
      providerRegionId: resolved.region.id,
      providerOsId: Number(resolved.os.id),
      osFamily: resolved.request.osFamily,
      cpu: resolved.card.cpu,
      ramGb: resolved.card.ramGb,
      diskGb: resolved.card.diskGb,
      gpuEnabled: Boolean(resolved.card.gpuName),
      gpuName: resolved.card.gpuName || null,
      gpuVramGb: resolved.card.gpuVramGb || null,
      billingMode: resolved.request.billingMode,
      durationHours: resolved.request.durationHours,
      autoDestroy,
      publicHourlyPrice: resolved.card.hourlyPrice,
      publicMonthlyPrice: resolved.card.monthlyPrice,
      publicSessionPrice: resolved.card.estimatedSessionPrice,
      providerMonthlyCost: resolved.providerMonthlyCost,
      expiresAt,
      metadata: {
        os_name: resolved.os.name || null,
        quote_confirmed_at: new Date().toISOString(),
        desktop_enabled: true,
        desktop_password: desktopPassword,
        desktop_port: 6080,
        desktop_tls: 'self_signed',
      },
    });

    pendingId = pending.id;
    label = 'nayla-pc-' + pending.id;

    let provider;
    try {
      provider = await createVultrInstance({
        planId: resolved.plan.id,
        regionId: resolved.region.id,
        osId: Number(resolved.os.id),
        label,
        userData: desktopUserData,
      });
      providerInstanceId = provider.id;
    } catch (error) {
      const recovered = await findVultrInstanceByLabel(label).catch(() => null);
      let recoveredCleanupOk = false;

      if (recovered?.id) {
        providerInstanceId = recovered.id;
        try {
          await deleteVultrInstance(recovered.id);
          recoveredCleanupOk = true;
        } catch {
          recoveredCleanupOk = false;
        }
      }

      await patchNaylaPcInstance({
        instanceId: pending.id,
        patch: recovered?.id && !recoveredCleanupOk
          ? {
              provider_instance_id: recovered.id,
              status: 'terminating',
              auto_destroy: true,
              expires_at: new Date().toISOString(),
              metadata: {
                ...(pending.metadata || {}),
                create_error:
                  error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                orphan_cleanup_attempted: true,
                orphan_cleanup_pending: true,
              },
            }
          : {
              status: 'error',
              terminated_at: recoveredCleanupOk ? new Date().toISOString() : null,
              metadata: {
                ...(pending.metadata || {}),
                create_error:
                  error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                orphan_cleanup_attempted: Boolean(recovered?.id),
                orphan_cleanup_ok: recoveredCleanupOk,
              },
            },
      }).catch(() => undefined);

      throw error;
    }

    let saved;
    try {
      saved = await patchNaylaPcInstance({
        instanceId: pending.id,
        patch: {
          provider_instance_id: provider.id,
          status: 'provisioning',
          main_ip: provider.main_ip || null,
          last_synced_at: new Date().toISOString(),
          metadata: {
            ...(pending.metadata || {}),
            provider_accepted_at: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      let cleanupOk = false;
      try {
        await deleteVultrInstance(provider.id);
        cleanupOk = true;
      } catch {
        cleanupOk = false;
      }

      await patchNaylaPcInstance({
        instanceId: pending.id,
        patch: cleanupOk
          ? {
              provider_instance_id: provider.id,
              status: 'error',
              terminated_at: new Date().toISOString(),
              metadata: {
                ...(pending.metadata || {}),
                persistence_error:
                  error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                provider_cleanup_attempted: true,
                provider_cleanup_ok: true,
              },
            }
          : {
              provider_instance_id: provider.id,
              status: 'terminating',
              auto_destroy: true,
              expires_at: new Date().toISOString(),
              metadata: {
                ...(pending.metadata || {}),
                persistence_error:
                  error instanceof Error ? error.message.slice(0, 500) : 'unknown',
                provider_cleanup_attempted: true,
                provider_cleanup_pending: true,
              },
            },
      }).catch(() => undefined);
      throw error;
    }

    return res.status(201).json({
      instance: toPublicNaylaPcInstance(saved),
      message:
        'Nayla PC fue aceptada por la red de cómputo. El arranque puede tardar unos minutos.',
    });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;

    if (code === 'PRICE_CHANGED') {
      return res.status(409).json({
        code,
        refreshRequired: true,
        error:
          error instanceof Error
            ? error.message
            : 'La oferta cambió. Actualiza la cotización.',
      });
    }

    if (code === 'ACTIVE_INSTANCE_EXISTS') {
      return res.status(409).json({
        code,
        error:
          error instanceof Error
            ? error.message
            : 'Ya existe una PC activa.',
      });
    }

    const message =
      error instanceof Error ? error.message : 'No se pudo crear Nayla PC.';

    return res.status(500).json({
      error: message,
      cleanupAttempted: Boolean(pendingId || providerInstanceId || label),
    });
  }
}

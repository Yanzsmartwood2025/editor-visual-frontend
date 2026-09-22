import type { NextApiRequest, NextApiResponse } from 'next';
import {
  isFirebaseAdmin,
  requireFirebaseUser,
} from '../../../../lib/firebaseAdmin';
import {
  createVultrInstanceFromSnapshot,
  deleteVultrInstance,
  deleteVultrSnapshot,
  findVultrInstanceByLabel,
  listVultrPlans,
  listVultrRegions,
} from '../../../../lib/gpu/vultrApi';
import {
  getActiveNaylaPcInstance,
  getDefaultNaylaPcProfile,
  getLatestNaylaPcSnapshot,
  patchNaylaPcInstance,
  patchNaylaPcSnapshot,
  createNaylaPcProvisioningInstance,
} from '../../../../lib/pc/store';
import {
  toPublicNaylaPcInstance,
  toPublicNaylaPcSnapshot,
} from '../../../../lib/pc/instances';

const envNumber = (key: string, fallback: number, min = 0, max = 10000) => {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const priceMultiplier = () =>
  envNumber('NAYLA_PC_PRICE_MULTIPLIER', 1, 1, 10);

const fixedHourlyUsd = () =>
  envNumber('NAYLA_PC_FIXED_HOURLY_USD', 0, 0, 25);

const maxSessionUsd = () =>
  envNumber('NAYLA_PC_MAX_SESSION_USD', 100, 1, 10000);

const maxMonthlyUsd = () =>
  envNumber('NAYLA_PC_MAX_MONTHLY_USD', 750, 1, 10000);

const leaseSafetySeconds = () =>
  Math.min(
    300,
    Math.max(30, envNumber('NAYLA_PC_LEASE_SAFETY_SECONDS', 90, 1, 300))
  );

const roundMoney = (value: number) => Math.ceil(value * 1000) / 1000;

const ramGb = (plan: Record<string, unknown>) => {
  const mb = Number(plan.ram);
  return Number.isFinite(mb) && mb > 0
    ? Math.round((mb / 1024) * 10) / 10
    : 0;
};

const isGpuPlan = (plan: Record<string, unknown>) => {
  const type = String(plan.type || '').toLowerCase();
  const gpuType = String(plan.gpu_type || '').trim();
  const gpuVram = Number(plan.gpu_vram_gb ?? plan.gpu_vram);
  return type === 'vcg' || gpuType.length > 0 || (Number.isFinite(gpuVram) && gpuVram > 0);
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
      const snapshot = await getLatestNaylaPcSnapshot(user.uid);
      return res.status(200).json({
        snapshot: snapshot ? toPublicNaylaPcSnapshot(snapshot) : null,
        provisioningAllowed: isFirebaseAdmin(user),
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo consultar la PC guardada.',
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const action = String(req.body?.action || '').toLowerCase();
  const snapshot = await getLatestNaylaPcSnapshot(user.uid);

  if (!snapshot) {
    return res.status(404).json({ error: 'No tienes una PC guardada.' });
  }

  if (action === 'delete') {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({
        error: 'Debes confirmar la eliminación del snapshot.',
      });
    }

    try {
      await patchNaylaPcSnapshot({
        snapshotId: snapshot.id,
        patch: { status: 'deleting' },
      });
      await deleteVultrSnapshot(snapshot.provider_snapshot_id);
      const deleted = await patchNaylaPcSnapshot({
        snapshotId: snapshot.id,
        patch: {
          status: 'deleted',
          deleted_at: new Date().toISOString(),
        },
      });
      return res.status(200).json({
        snapshot: toPublicNaylaPcSnapshot(deleted),
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo eliminar la PC guardada.',
      });
    }
  }

  if (action !== 'resume') {
    return res.status(400).json({ error: 'Acción de snapshot no válida.' });
  }

  if (!isFirebaseAdmin(user)) {
    return res.status(403).json({
      code: 'PILOT_ONLY',
      error:
        'Reanudar una PC real está en piloto privado hasta conectar el cobro al cliente.',
    });
  }

  if (snapshot.status !== 'available') {
    return res.status(409).json({
      error:
        snapshot.status === 'pending'
          ? 'La PC todavía se está guardando.'
          : 'La PC guardada no está disponible para restaurar.',
      snapshot: toPublicNaylaPcSnapshot(snapshot),
    });
  }

  if (snapshot.gpu_enabled) {
    return res.status(422).json({
      error:
        'La restauración de escritorio con GPU seguirá bloqueada hasta validar la imagen gráfica.',
    });
  }

  try {
    const active = await getActiveNaylaPcInstance(user.uid);
    if (active) {
      return res.status(409).json({
        error: 'Ya tienes una Nayla PC activa o en proceso.',
      });
    }

    const billingMode =
      req.body?.billingMode === 'monthly' ? 'monthly' : 'hourly';
    const durationHours = Math.max(
      1,
      Math.min(24, Math.round(Number(req.body?.durationHours) || 1))
    );

    const [plans, regions] = await Promise.all([
      listVultrPlans(),
      listVultrRegions(),
    ]);
    const regionIds = new Set(regions.map((region) => region.id));

    const eligible = plans
      .filter((plan) => {
        if (isGpuPlan(plan)) return false;
        const cpu = Number(plan.vcpu_count);
        const memory = ramGb(plan);
        const disk = Number(plan.disk);
        const monthly = Number(plan.monthly_cost);
        return (
          Number.isFinite(cpu) &&
          cpu >= snapshot.cpu &&
          memory >= Number(snapshot.ram_gb) &&
          Number.isFinite(disk) &&
          disk >= snapshot.disk_gb &&
          Number.isFinite(monthly) &&
          monthly > 0 &&
          Array.isArray(plan.locations) &&
          plan.locations.some((id) => regionIds.has(id))
        );
      })
      .sort(
        (a, b) =>
          Number(a.monthly_cost) - Number(b.monthly_cost) ||
          Number(a.vcpu_count) - Number(b.vcpu_count)
      );

    const samePlan = eligible.find(
      (plan) =>
        plan.id === snapshot.provider_plan_id &&
        plan.locations?.includes(snapshot.provider_region_id)
    );
    const plan = samePlan || eligible[0];

    if (!plan) {
      return res.status(409).json({
        error:
          'No hay un plan actual con disco suficiente para restaurar esta PC.',
      });
    }

    const regionId = plan.locations?.includes(snapshot.provider_region_id)
      ? snapshot.provider_region_id
      : plan.locations?.find((id) => regionIds.has(id));

    if (!regionId) {
      return res.status(409).json({
        error: 'No hay una región disponible para restaurar esta PC.',
      });
    }

    const providerMonthly = Number(plan.monthly_cost);
    const billingCapHours = 672;
    const hourlyPrice = roundMoney(
      (providerMonthly / billingCapHours) * priceMultiplier() +
        fixedHourlyUsd()
    );
    const monthlyPrice = roundMoney(
      providerMonthly * priceMultiplier() +
        fixedHourlyUsd() * billingCapHours
    );
    const sessionPrice = roundMoney(hourlyPrice * durationHours);

    if (
      (billingMode === 'hourly' && sessionPrice > maxSessionUsd()) ||
      (billingMode === 'monthly' && monthlyPrice > maxMonthlyUsd())
    ) {
      return res.status(422).json({
        code: 'SPEND_GUARD',
        error: 'La restauración supera el límite de seguridad de Nayla PC.',
      });
    }

    if (req.body?.confirmResume !== true) {
      return res.status(200).json({
        confirmationRequired: true,
        snapshot: toPublicNaylaPcSnapshot(snapshot),
        quote: {
          cpu: Number(plan.vcpu_count),
          ramGb: ramGb(plan),
          diskGb: Number(plan.disk),
          hourlyPrice,
          monthlyPrice,
          sessionPrice,
          billingMode,
          durationHours,
        },
      });
    }

    const profile = await getDefaultNaylaPcProfile(user.uid);
    const autoDestroy = billingMode === 'hourly';
    const expiresAt = autoDestroy
      ? new Date(
          Date.now() +
            durationHours * 60 * 60 * 1000 -
            leaseSafetySeconds() * 1000
        ).toISOString()
      : null;

    const pending = await createNaylaPcProvisioningInstance({
      userId: user.uid,
      profileId: profile?.id || null,
      providerPlanId: plan.id,
      providerRegionId: regionId,
      providerOsId: Number(snapshot.provider_os_id || 0),
      osFamily: snapshot.os_family,
      cpu: Number(plan.vcpu_count),
      ramGb: ramGb(plan),
      diskGb: Number(plan.disk),
      gpuEnabled: false,
      billingMode,
      durationHours,
      autoDestroy,
      publicHourlyPrice: hourlyPrice,
      publicMonthlyPrice: monthlyPrice,
      publicSessionPrice: sessionPrice,
      providerMonthlyCost: providerMonthly,
      expiresAt,
      metadata: {
        restored_from_snapshot_id: snapshot.id,
        os_name: snapshot.os_name || null,
        desktop_enabled: snapshot.metadata?.desktop_enabled === true,
        desktop_password:
          typeof snapshot.metadata?.desktop_password === 'string'
            ? String(snapshot.metadata.desktop_password)
            : null,
        desktop_port: snapshot.metadata?.desktop_port || 6080,
        desktop_tls: snapshot.metadata?.desktop_tls || 'self_signed',
      },
    });

    const label = 'nayla-pc-' + pending.id;
    let providerInstanceId = '';

    try {
      let provider;
      try {
        provider = await createVultrInstanceFromSnapshot({
          planId: plan.id,
          regionId,
          snapshotId: snapshot.provider_snapshot_id,
          label,
        });
        providerInstanceId = provider.id;
      } catch (error) {
        const recovered = await findVultrInstanceByLabel(label).catch(() => null);
        let cleanupOk = false;

        if (recovered?.id) {
          providerInstanceId = recovered.id;
          try {
            await deleteVultrInstance(recovered.id);
            cleanupOk = true;
          } catch {
            cleanupOk = false;
          }
        }

        await patchNaylaPcInstance({
          instanceId: pending.id,
          patch:
            recovered?.id && !cleanupOk
              ? {
                  provider_instance_id: recovered.id,
                  status: 'terminating',
                  auto_destroy: true,
                  expires_at: new Date().toISOString(),
                  metadata: {
                    restore_error:
                      error instanceof Error
                        ? error.message.slice(0, 500)
                        : 'unknown',
                    orphan_cleanup_pending: true,
                  },
                }
              : {
                  status: 'error',
                  terminated_at: cleanupOk ? new Date().toISOString() : null,
                  metadata: {
                    restore_error:
                      error instanceof Error
                        ? error.message.slice(0, 500)
                        : 'unknown',
                    orphan_cleanup_attempted: Boolean(recovered?.id),
                    orphan_cleanup_ok: cleanupOk,
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
                  restore_error:
                    error instanceof Error
                      ? error.message.slice(0, 500)
                      : 'unknown',
                  provider_cleanup_ok: true,
                },
              }
            : {
                provider_instance_id: provider.id,
                status: 'terminating',
                auto_destroy: true,
                expires_at: new Date().toISOString(),
                metadata: {
                  restore_error:
                    error instanceof Error
                      ? error.message.slice(0, 500)
                      : 'unknown',
                  provider_cleanup_pending: true,
                },
              },
        }).catch(() => undefined);

        throw error;
      }

      await patchNaylaPcSnapshot({
        snapshotId: snapshot.id,
        patch: {
          status: 'available',
          metadata: {
            ...(snapshot.metadata || {}),
            last_restored_at: new Date().toISOString(),
          },
        },
      });

      return res.status(201).json({
        instance: toPublicNaylaPcInstance(saved),
        snapshot: toPublicNaylaPcSnapshot(snapshot),
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : 'No se pudo reanudar Nayla PC.',
    });
  }
}

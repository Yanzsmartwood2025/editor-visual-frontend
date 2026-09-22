import { randomBytes, timingSafeEqual } from 'node:crypto';
import https from 'node:https';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  buildNaylaPcDesktopUserData,
  createVultrInstance,
  createVultrInstanceFromSnapshot,
  deleteVultrInstance,
  deleteVultrSnapshot,
  findVultrInstanceByLabel,
  getVultrAccountSummary,
  getVultrInstance,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
} from '../../../lib/gpu/vultrApi';
import {
  finalizePendingNaylaPcSnapshots,
  saveAndDestroyNaylaPcInstance,
  syncNaylaPcInstance,
  terminateNaylaPcInstance,
  toPublicNaylaPcInstance,
  toPublicNaylaPcSnapshot,
} from '../../../lib/pc/instances';
import {
  createNaylaPcProvisioningInstance,
  getActiveNaylaPcInstance,
  getLatestNaylaPcSnapshot,
  getNaylaInternalSecret,
  patchNaylaPcInstance,
  patchNaylaPcSnapshot,
} from '../../../lib/pc/store';

export const config = {
  maxDuration: 60,
};

const SMOKE_USER = '__nayla_pc_desktop_snapshot_smoke__';

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

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
  return (
    type === 'vcg' ||
    gpuType.length > 0 ||
    (Number.isFinite(gpuVram) && gpuVram > 0)
  );
};

const desktopPassword = () =>
  randomBytes(8)
    .toString('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 8)
    .padEnd(8, '8');

const probeDesktop = async (ip?: string | null) => {
  if (!ip) return { ready: false, statusCode: null as number | null };

  return await new Promise<{ ready: boolean; statusCode: number | null }>(
    (resolve) => {
      const req = https.get(
        {
          hostname: ip,
          port: 6080,
          path: '/vnc.html',
          method: 'GET',
          rejectUnauthorized: false,
          timeout: 5_000,
          headers: { Host: ip },
        },
        (response) => {
          response.resume();
          resolve({
            ready:
              Number(response.statusCode) >= 200 &&
              Number(response.statusCode) < 500,
            statusCode: response.statusCode || null,
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ ready: false, statusCode: null });
      });
      req.on('error', () =>
        resolve({ ready: false, statusCode: null })
      );
    }
  );
};

const chooseCatalog = async () => {
  const [plans, regions, systems] = await Promise.all([
    listVultrPlans(),
    listVultrRegions(),
    listVultrOperatingSystems(),
  ]);

  const regionIds = new Set(regions.map((region) => region.id));
  const candidates = plans
    .filter((plan) => {
      if (isGpuPlan(plan)) return false;
      const cpu = Number(plan.vcpu_count);
      const memory = ramGb(plan);
      const disk = Number(plan.disk);
      const monthly = Number(plan.monthly_cost);
      return (
        cpu >= 2 &&
        memory >= 4 &&
        disk >= 80 &&
        Number.isFinite(monthly) &&
        monthly > 0 &&
        monthly <= 40 &&
        Array.isArray(plan.locations) &&
        plan.locations.some((id) => regionIds.has(id))
      );
    })
    .sort(
      (a, b) =>
        Number(a.monthly_cost) - Number(b.monthly_cost) ||
        Number(a.vcpu_count) - Number(b.vcpu_count)
    );

  const preferredRegions = ['mia', 'atl', 'dfw', 'ewr'];
  let plan = candidates[0];
  let regionId = '';

  for (const preferred of preferredRegions) {
    const match = candidates.find((item) => item.locations?.includes(preferred));
    if (match) {
      plan = match;
      regionId = preferred;
      break;
    }
  }

  if (!plan) {
    throw new Error('No hay un plan CPU económico con 2 vCPU, 4 GB RAM y 80 GB.');
  }

  if (!regionId) {
    regionId = plan.locations?.find((id) => regionIds.has(id)) || '';
  }
  if (!regionId) throw new Error('No hay una región utilizable para la prueba.');

  const os =
    systems.find((item) =>
      /ubuntu.*26\.04/i.test(String(item.name || ''))
    ) || null;

  if (!os) {
    throw new Error('Vultr no está ofreciendo Ubuntu 26.04 en el catálogo actual.');
  }

  const region = regions.find((item) => item.id === regionId);
  return { plan, regionId, region, os };
};

const cleanupRecoveredProvider = async ({
  label,
  rowId,
  error,
}: {
  label: string;
  rowId: string;
  error: unknown;
}) => {
  const recovered = await findVultrInstanceByLabel(label).catch(() => null);
  let cleanupOk = false;

  if (recovered?.id) {
    try {
      await deleteVultrInstance(recovered.id);
      cleanupOk = true;
    } catch {
      cleanupOk = false;
    }
  }

  await patchNaylaPcInstance({
    instanceId: rowId,
    patch:
      recovered?.id && !cleanupOk
        ? {
            provider_instance_id: recovered.id,
            status: 'terminating',
            auto_destroy: true,
            expires_at: new Date().toISOString(),
            metadata: {
              smoke: true,
              smoke_error:
                error instanceof Error ? error.message.slice(0, 500) : 'unknown',
              cleanup_pending: true,
            },
          }
        : {
            status: 'error',
            terminated_at: cleanupOk ? new Date().toISOString() : null,
            metadata: {
              smoke: true,
              smoke_error:
                error instanceof Error ? error.message.slice(0, 500) : 'unknown',
              cleanup_ok: cleanupOk,
            },
          },
  }).catch(() => undefined);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only.' });
  }

  const provided =
    typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const expected = await getNaylaInternalSecret('pc_desktop_smoke');

  if (!provided || !expected || !safeEqual(provided, expected)) {
    return res.status(404).json({ error: 'No disponible.' });
  }

  const action =
    typeof req.query.action === 'string'
      ? req.query.action.trim().toLowerCase()
      : 'status';

  try {
    if (action === 'balance') {
      const account = await getVultrAccountSummary();
      const catalog = await chooseCatalog();
      return res.status(200).json({
        ok: true,
        spendableBalanceUsd: account.balance,
        rawBalanceUsd: account.rawBalance,
        pendingChargesUsd: account.pendingCharges,
        candidate: {
          cpu: Number(catalog.plan.vcpu_count),
          ramGb: ramGb(catalog.plan),
          diskGb: Number(catalog.plan.disk),
          monthlyUsd: Number(catalog.plan.monthly_cost),
          hourlyUsd: Number(catalog.plan.monthly_cost) / 672,
          region:
            [catalog.region?.city, catalog.region?.country]
              .filter(Boolean)
              .join(', ') || catalog.regionId,
          os: catalog.os.name,
        },
      });
    }

    if (action === 'start') {
      const existing = await getActiveNaylaPcInstance(SMOKE_USER);
      if (existing) {
        return res.status(409).json({
          error: 'La prueba ya tiene una instancia activa.',
          instance: toPublicNaylaPcInstance(existing),
        });
      }

      const snapshot = await getLatestNaylaPcSnapshot(SMOKE_USER);
      if (snapshot) {
        return res.status(409).json({
          error: 'La prueba tiene un snapshot anterior. Ejecuta cleanup primero.',
          snapshot: toPublicNaylaPcSnapshot(snapshot),
        });
      }

      const account = await getVultrAccountSummary();

      const { plan, regionId, region, os } = await chooseCatalog();
      const password = desktopPassword();
      const userData = buildNaylaPcDesktopUserData({
        desktopPassword: password,
      });
      const monthly = Number(plan.monthly_cost);
      const hourly = Math.ceil((monthly / 672) * 10000) / 10000;
      const pending = await createNaylaPcProvisioningInstance({
        userId: SMOKE_USER,
        providerPlanId: plan.id,
        providerRegionId: regionId,
        providerOsId: Number(os.id),
        osFamily: 'linux',
        cpu: Number(plan.vcpu_count),
        ramGb: ramGb(plan),
        diskGb: Number(plan.disk),
        gpuEnabled: false,
        billingMode: 'hourly',
        durationHours: 2,
        autoDestroy: true,
        publicHourlyPrice: hourly,
        publicMonthlyPrice: monthly,
        publicSessionPrice: hourly * 2,
        providerMonthlyCost: monthly,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        metadata: {
          smoke: true,
          os_name: os.name || 'Ubuntu 26.04 LTS',
          desktop_enabled: true,
          desktop_password: password,
          desktop_port: 6080,
          desktop_tls: 'self_signed',
        },
      });

      const label = 'nayla-pc-smoke-' + pending.id;
      try {
        const provider = await createVultrInstance({
          planId: plan.id,
          regionId,
          osId: Number(os.id),
          label,
          userData,
        });

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
                    smoke: true,
                    smoke_error:
                      error instanceof Error
                        ? error.message.slice(0, 500)
                        : 'unknown',
                    cleanup_ok: true,
                  },
                }
              : {
                  provider_instance_id: provider.id,
                  status: 'terminating',
                  auto_destroy: true,
                  expires_at: new Date().toISOString(),
                  metadata: {
                    smoke: true,
                    smoke_error:
                      error instanceof Error
                        ? error.message.slice(0, 500)
                        : 'unknown',
                    cleanup_pending: true,
                  },
                },
          }).catch(() => undefined);
          throw error;
        }

        return res.status(201).json({
          ok: true,
          spendableBalanceBeforeUsd: account.balance,
          rawBalanceBeforeUsd: account.rawBalance,
          pendingChargesBeforeUsd: account.pendingCharges,
          computer: {
            cpu: saved.cpu,
            ramGb: Number(saved.ram_gb),
            diskGb: saved.disk_gb,
            monthlyUsd: monthly,
            hourlyUsd: hourly,
            region:
              [region?.city, region?.country]
                .filter(Boolean)
                .join(', ') || regionId,
            os: os.name,
          },
          instance: toPublicNaylaPcInstance(saved),
        });
      } catch (error) {
        await cleanupRecoveredProvider({
          label,
          rowId: pending.id,
          error,
        });
        throw error;
      }
    }

    if (action === 'save') {
      const active = await getActiveNaylaPcInstance(SMOKE_USER);
      if (!active) {
        return res.status(404).json({ error: 'No hay instancia activa para guardar.' });
      }

      const synced = await syncNaylaPcInstance(active);
      if (!synced.provider_instance_id) {
        return res.status(409).json({ error: 'La instancia todavía no tiene proveedor.' });
      }

      const result = await saveAndDestroyNaylaPcInstance({ row: synced });
      return res.status(202).json({
        ok: true,
        instance: toPublicNaylaPcInstance(result.instance),
        snapshot: toPublicNaylaPcSnapshot(result.snapshot),
      });
    }

    if (action === 'resume') {
      await finalizePendingNaylaPcSnapshots();

      const active = await getActiveNaylaPcInstance(SMOKE_USER);
      if (active) {
        return res.status(409).json({
          error: 'Todavía existe una instancia activa.',
          instance: toPublicNaylaPcInstance(active),
        });
      }

      const snapshot = await getLatestNaylaPcSnapshot(SMOKE_USER);
      if (!snapshot || snapshot.status !== 'available') {
        return res.status(409).json({
          error: 'El snapshot todavía no está disponible.',
          snapshot: snapshot ? toPublicNaylaPcSnapshot(snapshot) : null,
        });
      }

      const [plans, regions] = await Promise.all([
        listVultrPlans(),
        listVultrRegions(),
      ]);
      const regionIds = new Set(regions.map((region) => region.id));
      const candidates = plans
        .filter((plan) => {
          if (isGpuPlan(plan)) return false;
          return (
            Number(plan.vcpu_count) >= snapshot.cpu &&
            ramGb(plan) >= Number(snapshot.ram_gb) &&
            Number(plan.disk) >= snapshot.disk_gb &&
            Number(plan.monthly_cost) > 0 &&
            Array.isArray(plan.locations) &&
            plan.locations.some((id) => regionIds.has(id))
          );
        })
        .sort(
          (a, b) =>
            Number(a.monthly_cost) - Number(b.monthly_cost) ||
            Number(a.vcpu_count) - Number(b.vcpu_count)
        );

      const plan =
        candidates.find(
          (item) =>
            item.id === snapshot.provider_plan_id &&
            item.locations?.includes(snapshot.provider_region_id)
        ) || candidates[0];

      if (!plan) throw new Error('No hay plan compatible para restaurar.');

      const regionId = plan.locations?.includes(snapshot.provider_region_id)
        ? snapshot.provider_region_id
        : plan.locations?.find((id) => regionIds.has(id));

      if (!regionId) throw new Error('No hay región para restaurar.');

      const monthly = Number(plan.monthly_cost);
      const hourly = Math.ceil((monthly / 672) * 10000) / 10000;
      const pending = await createNaylaPcProvisioningInstance({
        userId: SMOKE_USER,
        providerPlanId: plan.id,
        providerRegionId: regionId,
        providerOsId: Number(snapshot.provider_os_id || 0),
        osFamily: snapshot.os_family,
        cpu: Number(plan.vcpu_count),
        ramGb: ramGb(plan),
        diskGb: Number(plan.disk),
        gpuEnabled: false,
        billingMode: 'hourly',
        durationHours: 2,
        autoDestroy: true,
        publicHourlyPrice: hourly,
        publicMonthlyPrice: monthly,
        publicSessionPrice: hourly * 2,
        providerMonthlyCost: monthly,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        metadata: {
          smoke: true,
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

      const label = 'nayla-pc-smoke-restore-' + pending.id;
      try {
        const provider = await createVultrInstanceFromSnapshot({
          planId: plan.id,
          regionId,
          snapshotId: snapshot.provider_snapshot_id,
          label,
        });

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
                }
              : {
                  provider_instance_id: provider.id,
                  status: 'terminating',
                  auto_destroy: true,
                  expires_at: new Date().toISOString(),
                },
          }).catch(() => undefined);
          throw error;
        }

        return res.status(201).json({
          ok: true,
          instance: toPublicNaylaPcInstance(saved),
          snapshot: toPublicNaylaPcSnapshot(snapshot),
        });
      } catch (error) {
        await cleanupRecoveredProvider({
          label,
          rowId: pending.id,
          error,
        });
        throw error;
      }
    }

    if (action === 'cleanup') {
      const active = await getActiveNaylaPcInstance(SMOKE_USER);
      if (active) {
        await terminateNaylaPcInstance({
          row: active,
          reason: 'desktop_snapshot_smoke_cleanup',
        }).catch(async () => {
          if (active.provider_instance_id) {
            await deleteVultrInstance(active.provider_instance_id).catch(
              () => undefined
            );
          }
        });
      }

      const snapshot = await getLatestNaylaPcSnapshot(SMOKE_USER);
      if (snapshot) {
        await patchNaylaPcSnapshot({
          snapshotId: snapshot.id,
          patch: { status: 'deleting' },
        }).catch(() => undefined);
        await deleteVultrSnapshot(snapshot.provider_snapshot_id).catch(
          () => undefined
        );
        await patchNaylaPcSnapshot({
          snapshotId: snapshot.id,
          patch: {
            status: 'deleted',
            deleted_at: new Date().toISOString(),
          },
        }).catch(() => undefined);
      }

      return res.status(200).json({ ok: true, cleaned: true });
    }

    await finalizePendingNaylaPcSnapshots();

    let active = await getActiveNaylaPcInstance(SMOKE_USER);
    if (active) active = await syncNaylaPcInstance(active);

    const snapshot = await getLatestNaylaPcSnapshot(SMOKE_USER);
    const provider =
      active?.provider_instance_id
        ? await getVultrInstance(active.provider_instance_id)
        : null;
    const probe = await probeDesktop(provider?.main_ip || active?.main_ip);

    return res.status(200).json({
      ok: true,
      instance: active ? toPublicNaylaPcInstance(active) : null,
      provider: provider
        ? {
            status: provider.status,
            powerStatus: provider.power_status,
            serverStatus: provider.server_status,
            hasIpv4: Boolean(provider.main_ip),
          }
        : null,
      desktop: probe,
      snapshot: snapshot ? toPublicNaylaPcSnapshot(snapshot) : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      action,
      error:
        error instanceof Error ? error.message : 'Falló la prueba Nayla PC.',
    });
  }
}

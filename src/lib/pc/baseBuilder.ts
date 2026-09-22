import {
  buildNaylaPcDesktopUserData,
  createVultrInstance,
  createVultrSnapshot,
  deleteVultrInstance,
  deleteVultrSnapshot,
  findVultrInstanceByLabel,
  getVultrInstance,
  getVultrSnapshot,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
  probeNaylaPcDesktop,
} from '../gpu/vultrApi';
import {
  createNaylaPcBaseImage,
  deleteNaylaInternalSecret,
  getAvailableNaylaPcBaseImage,
  getLatestNaylaPcBaseImage,
  patchNaylaPcBaseImage,
  retireAvailableNaylaPcBaseImages,
  setNaylaInternalSecret,
} from './store';

export const NAYLA_PC_BASE_LABEL = 'nayla-pc-base-ubuntu-2604-xfce-v2';
export const NAYLA_PC_BASE_VERSION = 'ubuntu-26.04-xfce-v2';

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
      const disk = Number(plan.disk);
      const monthly = Number(plan.monthly_cost);
      return (
        Number(plan.vcpu_count) >= 1 &&
        ramGb(plan) >= 2 &&
        disk >= 40 &&
        disk <= 100 &&
        monthly > 0 &&
        monthly <= 25 &&
        Array.isArray(plan.locations) &&
        plan.locations.some((id) => regionIds.has(id))
      );
    })
    .sort(
      (a, b) =>
        Number(a.disk) - Number(b.disk) ||
        Number(a.monthly_cost) - Number(b.monthly_cost)
    );

  const plan =
    candidates.find((item) => item.locations?.includes('mia')) || candidates[0];
  if (!plan) throw new Error('No hay plan compatible para Nayla Base.');

  const regionId = plan.locations?.includes('mia')
    ? 'mia'
    : plan.locations?.find((id) => regionIds.has(id));
  if (!regionId) throw new Error('No hay región compatible para Nayla Base.');

  const os =
    systems.find((item) => /ubuntu.*26\.04/i.test(String(item.name || ''))) ||
    null;
  if (!os) throw new Error('Ubuntu 26.04 LTS no está disponible.');

  return {
    plan,
    regionId,
    region: regions.find((item) => item.id === regionId),
    os,
  };
};

const monthlySnapshotCost = (sizeBytes: number) =>
  Math.ceil(((Math.max(0, sizeBytes) / 1024 ** 3) * 0.05) * 10000) / 10000;

const envMinutes = (key: string, fallback: number, max: number) => {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(5, parsed));
};

const buildTimeoutMs = () =>
  envMinutes('NAYLA_PC_BASE_BUILD_TIMEOUT_MINUTES', 15, 30) * 60_000;

const snapshotTimeoutMs = () =>
  envMinutes('NAYLA_PC_BASE_SNAPSHOT_TIMEOUT_MINUTES', 35, 60) * 60_000;

const ageMs = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : 0;
};


export const startNaylaPcBaseBuild = async () => {
  const available = await getAvailableNaylaPcBaseImage('linux');
  if (available?.version === NAYLA_PC_BASE_VERSION) {
    return { state: 'available' as const, base: available };
  }

  const existing = await findVultrInstanceByLabel(NAYLA_PC_BASE_LABEL);
  if (existing) return { state: 'building' as const, provider: existing };

  const building = await getLatestNaylaPcBaseImage(['building']);
  if (building) return { state: 'snapshotting' as const, base: building };

  const catalog = await chooseCatalog();
  const userData = buildNaylaPcDesktopUserData({
    desktopPassword: 'Base2604',
  });

  const provider = await createVultrInstance({
    planId: catalog.plan.id,
    regionId: catalog.regionId,
    osId: Number(catalog.os.id),
    label: NAYLA_PC_BASE_LABEL,
    userData,
  });

  try {
    await setNaylaInternalSecret('pc_base_build_active', provider.id);
  } catch (error) {
    await deleteVultrInstance(provider.id).catch(() => undefined);
    throw error;
  }

  return {
    state: 'building' as const,
    provider,
    candidate: {
      cpu: Number(catalog.plan.vcpu_count),
      ramGb: ramGb(catalog.plan),
      diskGb: Number(catalog.plan.disk),
      monthlyUsd: Number(catalog.plan.monthly_cost),
      region:
        [catalog.region?.city, catalog.region?.country].filter(Boolean).join(', ') ||
        catalog.regionId,
      os: catalog.os.name,
    },
  };
};

export const cleanupNaylaPcBaseBuild = async () => {
  const builder = await findVultrInstanceByLabel(NAYLA_PC_BASE_LABEL);
  if (builder?.id) {
    await deleteVultrInstance(builder.id);
  }

  const building = await getLatestNaylaPcBaseImage(['building']);
  if (building) {
    await patchNaylaPcBaseImage({
      baseImageId: building.id,
      patch: {
        status: 'error',
        metadata: {
          ...(building.metadata || {}),
          cleanup_reason: 'manual_cleanup',
          cleanup_at: new Date().toISOString(),
        },
      },
    });
  }

  const after = await findVultrInstanceByLabel(NAYLA_PC_BASE_LABEL);
  if (!after) {
    await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
  }
  return {
    state: after ? ('cleanup_pending' as const) : ('cleaned' as const),
    providerInstancePresent: Boolean(after),
  };
};

export const progressNaylaPcBaseBuild = async () => {
  const available = await getAvailableNaylaPcBaseImage('linux');
  if (available?.version === NAYLA_PC_BASE_VERSION) {
    return { state: 'available' as const, base: available };
  }

  const building = await getLatestNaylaPcBaseImage(['building']);
  if (building) {
    if (ageMs(building.created_at) > snapshotTimeoutMs()) {
      const builderId =
        typeof building.metadata?.builder_instance_id === 'string'
          ? String(building.metadata.builder_instance_id)
          : '';
      await deleteVultrSnapshot(building.provider_snapshot_id).catch(() => undefined);
      if (builderId) await deleteVultrInstance(builderId).catch(() => undefined);
      await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
      const failed = await patchNaylaPcBaseImage({
        baseImageId: building.id,
        patch: {
          status: 'error',
          metadata: {
            ...(building.metadata || {}),
            cleanup_reason: 'snapshot_timeout',
            cleanup_at: new Date().toISOString(),
          },
        },
      });
      return { state: 'error' as const, base: failed, autoCleaned: true };
    }

    const providerSnapshot = await getVultrSnapshot(building.provider_snapshot_id);
    if (!providerSnapshot) {
      const builderId =
        typeof building.metadata?.builder_instance_id === 'string'
          ? String(building.metadata.builder_instance_id)
          : '';
      if (builderId) await deleteVultrInstance(builderId).catch(() => undefined);
      await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
      const failed = await patchNaylaPcBaseImage({
        baseImageId: building.id,
        patch: {
          status: 'error',
          metadata: {
            ...(building.metadata || {}),
            cleanup_reason: 'snapshot_missing',
            cleanup_at: new Date().toISOString(),
          },
        },
      });
      return { state: 'error' as const, base: failed, autoCleaned: true };
    }

    const status = String(providerSnapshot.status || '').toLowerCase();
    if (['error', 'failed'].includes(status)) {
      const builderId =
        typeof building.metadata?.builder_instance_id === 'string'
          ? String(building.metadata.builder_instance_id)
          : '';
      await deleteVultrSnapshot(building.provider_snapshot_id).catch(() => undefined);
      if (builderId) await deleteVultrInstance(builderId).catch(() => undefined);
      await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
      const failed = await patchNaylaPcBaseImage({
        baseImageId: building.id,
        patch: {
          status: 'error',
          metadata: {
            ...(building.metadata || {}),
            cleanup_reason: 'snapshot_failed',
            provider_snapshot_status: status,
            cleanup_at: new Date().toISOString(),
          },
        },
      });
      return { state: 'error' as const, base: failed, autoCleaned: true };
    }

    if (!['complete', 'available', 'active'].includes(status)) {
      return { state: 'snapshotting' as const, base: building, providerStatus: status };
    }

    const sizeBytes = Number(providerSnapshot.size);
    const ready = await patchNaylaPcBaseImage({
      baseImageId: building.id,
      patch: {
        status: 'available',
        snapshot_size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        storage_monthly_usd: Number.isFinite(sizeBytes)
          ? monthlySnapshotCost(sizeBytes)
          : null,
        ready_at: new Date().toISOString(),
      },
    });

    await retireAvailableNaylaPcBaseImages({
      osFamily: 'linux',
      exceptId: ready.id,
    });

    const builderId =
      typeof ready.metadata?.builder_instance_id === 'string'
        ? String(ready.metadata.builder_instance_id)
        : '';
    if (builderId) await deleteVultrInstance(builderId).catch(() => undefined);
    await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);

    return { state: 'available' as const, base: ready };
  }

  const builder = await findVultrInstanceByLabel(NAYLA_PC_BASE_LABEL);
  if (!builder) {
    await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
    return { state: 'idle' as const };
  }

  const live = await getVultrInstance(builder.id);
  if (!live) {
    await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
    return { state: 'idle' as const };
  }

  if (ageMs(typeof live.date_created === 'string' ? live.date_created : null) > buildTimeoutMs()) {
    await deleteVultrInstance(live.id);
    const after = await findVultrInstanceByLabel(NAYLA_PC_BASE_LABEL);
    if (!after) {
      await deleteNaylaInternalSecret('pc_base_build_active').catch(() => undefined);
    }
    return {
      state: after ? ('cleanup_pending' as const) : ('error' as const),
      desktopReady: false,
      autoCleaned: !after,
      reason: 'desktop_build_timeout',
    };
  }

  const desktopReady = await probeNaylaPcDesktop(
    live.main_ip,
    6080,
    '/nayla-base-ready.txt'
  );
  if (!desktopReady) {
    return { state: 'building' as const, provider: live, desktopReady: false };
  }

  const catalog = await chooseCatalog();
  const snapshot = await createVultrSnapshot({
    instanceId: live.id,
    description: NAYLA_PC_BASE_LABEL,
  });

  const row = await createNaylaPcBaseImage({
    providerSnapshotId: snapshot.id,
    osFamily: 'linux',
    osName: catalog.os.name || 'Ubuntu 26.04 LTS x64',
    version: NAYLA_PC_BASE_VERSION,
    providerPlanId: live.plan || catalog.plan.id,
    providerRegionId: live.region || catalog.regionId,
    providerOsId: Number(catalog.os.id),
    minDiskGb: Number(catalog.plan.disk),
    minRamGb: 2,
    desktopStack: 'XFCE + Xvfb + x11vnc + noVNC',
    metadata: {
      builder_instance_id: live.id,
      desktop_ready_at: new Date().toISOString(),
    },
  });

  return { state: 'snapshotting' as const, base: row, desktopReady: true };
};

import {
  deleteVultrInstance,
  getVultrInstance,
  haltVultrInstance,
  rebootVultrInstance,
  startVultrInstance,
  type VultrInstance,
} from '../gpu/vultrApi';
import {
  listExpiredNaylaPcInstances,
  patchNaylaPcInstance,
  type NaylaPcInstanceRow,
  type NaylaPcInstanceStatus,
} from './store';

const providerStatus = (
  provider: VultrInstance,
  current: NaylaPcInstanceStatus
): NaylaPcInstanceStatus => {
  const power = String(provider.power_status || '').toLowerCase();
  const status = String(provider.status || '').toLowerCase();

  if (power === 'stopped' || power === 'off') return 'stopped';
  if (power === 'running') return 'running';
  if (status === 'active') return 'running';
  if (status === 'pending') return current === 'rebooting' ? 'rebooting' : 'provisioning';
  return current;
};

export const toPublicNaylaPcInstance = (row: NaylaPcInstanceRow) => ({
  id: row.id,
  osFamily: row.os_family,
  cpu: Number(row.cpu),
  ramGb: Number(row.ram_gb),
  diskGb: Number(row.disk_gb),
  gpuEnabled: row.gpu_enabled,
  gpuName: row.gpu_name || undefined,
  gpuVramGb: row.gpu_vram_gb == null ? undefined : Number(row.gpu_vram_gb),
  billingMode: row.billing_mode,
  durationHours: row.duration_hours,
  autoDestroy: row.auto_destroy,
  status: row.status,
  mainIp: row.main_ip || undefined,
  hourlyPrice: Number(row.public_hourly_price),
  monthlyPrice: Number(row.public_monthly_price),
  sessionPrice: Number(row.public_session_price),
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  terminatedAt: row.terminated_at,
});

export const syncNaylaPcInstance = async (
  row: NaylaPcInstanceRow
): Promise<NaylaPcInstanceRow> => {
  if (!row.provider_instance_id || row.status === 'terminated') return row;

  const provider = await getVultrInstance(row.provider_instance_id);
  if (!provider) {
    return patchNaylaPcInstance({
      instanceId: row.id,
      patch: {
        status: 'terminated',
        main_ip: null,
        terminated_at: row.terminated_at || new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        metadata: {
          ...(row.metadata || {}),
          provider_missing: true,
        },
      },
    });
  }

  return patchNaylaPcInstance({
    instanceId: row.id,
    patch: {
      status: providerStatus(provider, row.status),
      main_ip: provider.main_ip || row.main_ip,
      last_synced_at: new Date().toISOString(),
    },
  });
};

export const terminateNaylaPcInstance = async ({
  row,
  reason,
}: {
  row: NaylaPcInstanceRow;
  reason: string;
}): Promise<NaylaPcInstanceRow> => {
  if (row.status === 'terminated') return row;

  let current = await patchNaylaPcInstance({
    instanceId: row.id,
    patch: {
      status: 'terminating',
      metadata: {
        ...(row.metadata || {}),
        termination_reason: reason,
      },
    },
  });

  if (current.provider_instance_id) {
    await deleteVultrInstance(current.provider_instance_id);
  }

  current = await patchNaylaPcInstance({
    instanceId: row.id,
    patch: {
      status: 'terminated',
      main_ip: null,
      terminated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...(current.metadata || {}),
        termination_reason: reason,
      },
    },
  });

  return current;
};

export const applyNaylaPcAction = async ({
  row,
  action,
}: {
  row: NaylaPcInstanceRow;
  action: 'start' | 'stop' | 'reboot' | 'destroy';
}): Promise<NaylaPcInstanceRow> => {
  if (action === 'destroy') {
    return terminateNaylaPcInstance({ row, reason: 'user_destroy' });
  }

  if (!row.provider_instance_id) {
    throw new Error('La PC todavía no tiene una instancia de cómputo asignada.');
  }

  if (action === 'start') {
    await startVultrInstance(row.provider_instance_id);
    return patchNaylaPcInstance({
      instanceId: row.id,
      patch: { status: 'provisioning', last_synced_at: new Date().toISOString() },
    });
  }

  if (action === 'stop') {
    await haltVultrInstance(row.provider_instance_id);
    return patchNaylaPcInstance({
      instanceId: row.id,
      patch: { status: 'stopped', last_synced_at: new Date().toISOString() },
    });
  }

  await rebootVultrInstance(row.provider_instance_id);
  return patchNaylaPcInstance({
    instanceId: row.id,
    patch: { status: 'rebooting', last_synced_at: new Date().toISOString() },
  });
};

export const sweepExpiredNaylaPcInstances = async () => {
  const expired = await listExpiredNaylaPcInstances(20);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of expired) {
    try {
      await terminateNaylaPcInstance({ row, reason: 'hourly_lease_expired' });
      results.push({ id: row.id, ok: true });
    } catch (error) {
      results.push({
        id: row.id,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      });
    }
  }

  return {
    checked: expired.length,
    terminated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
};

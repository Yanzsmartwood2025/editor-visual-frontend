import {
  createVultrSnapshot,
  deleteVultrInstance,
  deleteVultrSnapshot,
  getVultrInstance,
  getVultrSnapshot,
  haltVultrInstance,
  probeNaylaPcDesktop,
  rebootVultrInstance,
  startVultrInstance,
  type VultrInstance,
} from '../gpu/vultrApi';
import {
  createNaylaPcSnapshotRow,
  getNaylaPcInstanceById,
  listExpiredNaylaPcInstances,
  listOlderAvailableNaylaPcSnapshots,
  listPendingNaylaPcSnapshots,
  listNaylaPcSnapshottingInstances,
  patchNaylaPcInstance,
  patchNaylaPcSnapshot,
  revokeNaylaPcDriveSessionsForInstance,
  type NaylaPcInstanceRow,
  type NaylaPcInstanceStatus,
  type NaylaPcSnapshotRow,
} from './store';

const providerStatus = (
  provider: VultrInstance,
  current: NaylaPcInstanceStatus
): NaylaPcInstanceStatus => {
  const power = String(provider.power_status || '').toLowerCase();
  const status = String(provider.status || '').toLowerCase();

  if (current === 'terminating' || current === 'snapshotting') return current;
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
  desktop:
    row.main_ip && row.metadata?.desktop_enabled === true
      ? {
          url:
            'https://' +
            row.main_ip +
            ':' +
            String(row.metadata?.desktop_port || 6080) +
            '/vnc.html?autoconnect=1&resize=scale',
          password:
            typeof row.metadata?.desktop_password === 'string'
              ? String(row.metadata.desktop_password)
              : undefined,
          tls: row.metadata?.desktop_tls || 'self_signed',
        }
      : undefined,
  hourlyPrice: Number(row.public_hourly_price),
  monthlyPrice: Number(row.public_monthly_price),
  sessionPrice: Number(row.public_session_price),
  expiresAt: row.expires_at,
  readyAt: row.ready_at,
  billableStartedAt: row.billable_started_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  terminatedAt: row.terminated_at,
});

export const toPublicNaylaPcSnapshot = (row: NaylaPcSnapshotRow) => ({
  id: row.id,
  status: row.status,
  osFamily: row.os_family,
  osName: row.os_name || undefined,
  cpu: Number(row.cpu),
  ramGb: Number(row.ram_gb),
  diskGb: Number(row.disk_gb),
  gpuEnabled: row.gpu_enabled,
  gpuName: row.gpu_name || undefined,
  gpuVramGb: row.gpu_vram_gb == null ? undefined : Number(row.gpu_vram_gb),
  sizeBytes: row.size_bytes == null ? undefined : Number(row.size_bytes),
  storageMonthlyUsd:
    row.storage_monthly_usd == null ? undefined : Number(row.storage_monthly_usd),
  createdAt: row.created_at,
  readyAt: row.ready_at,
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

  const mainIp = provider.main_ip || row.main_ip;
  const providerState = providerStatus(provider, row.status);
  const desktopEnabled = row.metadata?.desktop_enabled === true;
  let desktopReady = Boolean(row.ready_at);

  if (
    desktopEnabled &&
    !desktopReady &&
    providerState === 'running' &&
    mainIp &&
    mainIp !== '0.0.0.0'
  ) {
    desktopReady = await probeNaylaPcDesktop(
      mainIp,
      Number(row.metadata?.desktop_port || 6080)
    ).catch(() => false);
  }

  const now = new Date();
  const readyPatch: Partial<NaylaPcInstanceRow> = {};

  if (desktopReady && !row.ready_at) {
    readyPatch.ready_at = now.toISOString();
    readyPatch.billable_started_at = now.toISOString();

    if (row.billing_mode === 'hourly') {
      const safetyRaw = Number(process.env.NAYLA_PC_LEASE_SAFETY_SECONDS || 90);
      const safetySeconds = Number.isFinite(safetyRaw)
        ? Math.min(300, Math.max(30, safetyRaw))
        : 90;
      readyPatch.auto_destroy = true;
      readyPatch.expires_at = new Date(
        now.getTime() +
          Number(row.duration_hours) * 60 * 60 * 1000 -
          safetySeconds * 1000
      ).toISOString();
    } else {
      readyPatch.auto_destroy = false;
      readyPatch.expires_at = null;
    }
  }

  return patchNaylaPcInstance({
    instanceId: row.id,
    patch: {
      status:
        desktopEnabled && !desktopReady && providerState === 'running'
          ? 'provisioning'
          : providerState,
      main_ip: mainIp,
      last_synced_at: now.toISOString(),
      ...readyPatch,
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
      auto_destroy: true,
      expires_at: new Date().toISOString(),
      metadata: {
        ...(row.metadata || {}),
        termination_reason: reason,
      },
    },
  });

  if (current.provider_instance_id) {
    await deleteVultrInstance(current.provider_instance_id);
  }

  await revokeNaylaPcDriveSessionsForInstance(row.id).catch(() => undefined);

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

export const saveAndDestroyNaylaPcInstance = async ({
  row,
}: {
  row: NaylaPcInstanceRow;
}): Promise<{ instance: NaylaPcInstanceRow; snapshot: NaylaPcSnapshotRow | null }> => {
  if (!row.provider_instance_id) {
    throw new Error('La PC todavía no tiene una instancia real para guardar.');
  }
  if (row.status === 'snapshotting') {
    throw new Error('La PC ya se está guardando.');
  }

  const requestedAt = new Date().toISOString();
  const instance = await patchNaylaPcInstance({
    instanceId: row.id,
    patch: {
      status: 'snapshotting',
      metadata: {
        ...(row.metadata || {}),
        drive_flush_requested_at: requestedAt,
        drive_flush_completed_at: null,
        save_snapshot_id: null,
        save_started_at: null,
        save_stage: 'syncing_drive',
        save_error: null,
      },
    },
  });

  return { instance, snapshot: null };
};

export const progressNaylaPcSaveRequests = async () => {
  const rows = await listNaylaPcSnapshottingInstances(10);
  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        if (typeof row.metadata?.save_snapshot_id === 'string') {
          return { id: row.id, ok: true as const, action: 'snapshot_exists' as const };
        }

        const requestedAt =
          typeof row.metadata?.drive_flush_requested_at === 'string'
            ? String(row.metadata.drive_flush_requested_at)
            : '';
        if (!requestedAt) {
          return { id: row.id, ok: true as const, action: 'legacy_wait' as const };
        }

        const requestedMs = Date.parse(requestedAt);
        const age =
          Number.isFinite(requestedMs) ? Math.max(0, Date.now() - requestedMs) : 0;
        const completedAt =
          typeof row.metadata?.drive_flush_completed_at === 'string'
            ? String(row.metadata.drive_flush_completed_at)
            : '';

        if (!completedAt) {
          if (age > 3 * 60_000) {
            await patchNaylaPcInstance({
              instanceId: row.id,
              patch: {
                status: 'running',
                metadata: {
                  ...(row.metadata || {}),
                  save_stage: 'drive_flush_timeout',
                  save_error: 'drive_flush_timeout',
                  drive_flush_requested_at: null,
                },
              },
            });
            return { id: row.id, ok: false as const, error: 'drive_flush_timeout' };
          }
          return { id: row.id, ok: true as const, action: 'waiting_drive' as const };
        }

        if (!row.provider_instance_id) {
          throw new Error('La PC perdió su instancia antes de crear el snapshot.');
        }

        const description =
          'nayla-pc-' + row.user_id.slice(0, 18) + '-' + Date.now();
        const providerSnapshot = await createVultrSnapshot({
          instanceId: row.provider_instance_id,
          description,
        });

        let snapshot: NaylaPcSnapshotRow;
        try {
          snapshot = await createNaylaPcSnapshotRow({
            userId: row.user_id,
            sourceInstanceId: row.id,
            providerSnapshotId: providerSnapshot.id,
            description,
            osFamily: row.os_family,
            osName:
              typeof row.metadata?.os_name === 'string'
                ? String(row.metadata.os_name)
                : null,
            cpu: row.cpu,
            ramGb: row.ram_gb,
            diskGb: row.disk_gb,
            gpuEnabled: row.gpu_enabled,
            gpuName: row.gpu_name,
            gpuVramGb: row.gpu_vram_gb,
            providerPlanId: row.provider_plan_id,
            providerRegionId: row.provider_region_id,
            providerOsId: row.provider_os_id,
            metadata: {
              source_provider_instance_id: row.provider_instance_id,
              desktop_enabled: row.metadata?.desktop_enabled === true,
              desktop_port: row.metadata?.desktop_port || 6080,
              desktop_tls: row.metadata?.desktop_tls || 'self_signed',
              drive_cache_flushed_at: completedAt,
            },
          });
        } catch (error) {
          await deleteVultrSnapshot(providerSnapshot.id).catch(() => undefined);
          throw error;
        }

        await patchNaylaPcInstance({
          instanceId: row.id,
          patch: {
            metadata: {
              ...(row.metadata || {}),
              save_snapshot_id: snapshot.id,
              save_started_at: new Date().toISOString(),
              save_stage: 'provider_snapshot',
            },
          },
        });

        return {
          id: row.id,
          ok: true as const,
          action: 'snapshot_started' as const,
          snapshotId: snapshot.id,
        };
      } catch (error) {
        await patchNaylaPcInstance({
          instanceId: row.id,
          patch: {
            status: 'running',
            metadata: {
              ...(row.metadata || {}),
              save_stage: 'error',
              save_error:
                error instanceof Error ? error.message.slice(0, 300) : 'unknown',
              drive_flush_requested_at: null,
            },
          },
        }).catch(() => undefined);

        return {
          id: row.id,
          ok: false as const,
          error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
        };
      }
    })
  );

  return {
    checked: rows.length,
    started: results.filter((result) => result.ok && result.action === 'snapshot_started').length,
    waiting: results.filter((result) => result.ok && result.action === 'waiting_drive').length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
};

const snapshotStorageMonthlyUsd = (sizeBytes: number) =>
  Math.ceil(((Math.max(0, sizeBytes) / 1024 ** 3) * 0.05) * 10000) / 10000;

export const finalizePendingNaylaPcSnapshots = async () => {
  const pending = await listPendingNaylaPcSnapshots(5);

  const results = await Promise.all(
    pending.map(async (row) => {
      try {
        if (row.status === 'deleting') {
          await deleteVultrSnapshot(row.provider_snapshot_id);
          await patchNaylaPcSnapshot({
            snapshotId: row.id,
            patch: {
              status: 'deleted',
              deleted_at: new Date().toISOString(),
            },
          });
          return { id: row.id, ok: true as const, action: 'deleted' as const };
        }

        const provider = await getVultrSnapshot(row.provider_snapshot_id);
        if (!provider) {
          await patchNaylaPcSnapshot({
            snapshotId: row.id,
            patch: {
              status: 'error',
              metadata: {
                ...(row.metadata || {}),
                provider_missing: true,
              },
            },
          });
          if (row.source_instance_id) {
            const source = await getNaylaPcInstanceById(row.source_instance_id).catch(() => null);
            await patchNaylaPcInstance({
              instanceId: row.source_instance_id,
              patch: {
                status: 'running',
                metadata: {
                  ...(source?.metadata || {}),
                  save_stage: 'error',
                  save_error: 'snapshot_missing',
                  drive_flush_requested_at: null,
                },
              },
            }).catch(() => undefined);
          }
          return { id: row.id, ok: false as const, error: 'snapshot_missing' };
        }

        const status = String(provider.status || '').toLowerCase();
        const ready = ['complete', 'available', 'active'].includes(status);
        const failed = ['error', 'failed'].includes(status);

        if (failed) {
          await patchNaylaPcSnapshot({
            snapshotId: row.id,
            patch: {
              status: 'error',
              metadata: {
                ...(row.metadata || {}),
                provider_status: provider.status || null,
              },
            },
          });

          if (row.source_instance_id) {
            const source = await getNaylaPcInstanceById(row.source_instance_id).catch(() => null);
            await patchNaylaPcInstance({
              instanceId: row.source_instance_id,
              patch: {
                status: 'running',
                metadata: {
                  ...(source?.metadata || {}),
                  save_stage: 'error',
                  save_error: 'snapshot_failed',
                  drive_flush_requested_at: null,
                },
              },
            }).catch(() => undefined);
          }

          return { id: row.id, ok: false as const, error: 'snapshot_failed' };
        }

        if (!ready) {
          return { id: row.id, ok: true as const, action: 'waiting' as const };
        }

        const sizeBytes = Number(provider.size);

        if (row.source_instance_id) {
          const source = await getNaylaPcInstanceById(row.source_instance_id).catch(() => null);
          const sourceProviderInstanceId =
            typeof row.metadata?.source_provider_instance_id === 'string'
              ? String(row.metadata.source_provider_instance_id)
              : source?.provider_instance_id || '';

          if (sourceProviderInstanceId) {
            await deleteVultrInstance(sourceProviderInstanceId);
          }

          await revokeNaylaPcDriveSessionsForInstance(row.source_instance_id).catch(() => undefined);

          await patchNaylaPcInstance({
            instanceId: row.source_instance_id,
            patch: {
              status: 'terminated',
              main_ip: null,
              terminated_at: new Date().toISOString(),
              last_synced_at: new Date().toISOString(),
              metadata: {
                ...(source?.metadata || {}),
                save_snapshot_id: row.id,
                save_stage: 'complete',
                save_completed_at: new Date().toISOString(),
              },
            },
          });
        }

        await patchNaylaPcSnapshot({
          snapshotId: row.id,
          patch: {
            status: 'available',
            size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
            storage_monthly_usd: Number.isFinite(sizeBytes)
              ? snapshotStorageMonthlyUsd(sizeBytes)
              : null,
            ready_at: new Date().toISOString(),
            metadata: {
              ...(row.metadata || {}),
              provider_status: provider.status || null,
            },
          },
        });

        const older = await listOlderAvailableNaylaPcSnapshots({
          userId: row.user_id,
          excludeId: row.id,
        });

        await Promise.all(
          older.map(async (old) => {
            await patchNaylaPcSnapshot({
              snapshotId: old.id,
              patch: { status: 'deleting' },
            });
            try {
              await deleteVultrSnapshot(old.provider_snapshot_id);
              await patchNaylaPcSnapshot({
                snapshotId: old.id,
                patch: {
                  status: 'deleted',
                  deleted_at: new Date().toISOString(),
                },
              });
            } catch {
              // The next sweeper pass will retry rows left as deleting.
            }
          })
        );

        return { id: row.id, ok: true as const, action: 'saved' as const };
      } catch (error) {
        return {
          id: row.id,
          ok: false as const,
          error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
        };
      }
    })
  );

  return {
    checked: pending.length,
    saved: results.filter((result) => result.ok && result.action === 'saved').length,
    deleted: results.filter((result) => result.ok && result.action === 'deleted').length,
    waiting: results.filter((result) => result.ok && result.action === 'waiting').length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
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

  if (row.status === 'snapshotting') {
    throw new Error('Espera a que termine de guardarse la PC.');
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
  const expired = await listExpiredNaylaPcInstances(5);

  const results = await Promise.all(
    expired.map(async (row) => {
      try {
        await terminateNaylaPcInstance({ row, reason: 'hourly_lease_expired' });
        return { id: row.id, ok: true as const };
      } catch (error) {
        return {
          id: row.id,
          ok: false as const,
          error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
        };
      }
    })
  );

  return {
    checked: expired.length,
    terminated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
};

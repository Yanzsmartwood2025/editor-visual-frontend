export type GpuManifestJobState = {
  status: string;
  destroyedAt?: string | null;
  cancelRequested?: boolean;
};

const terminalStatuses = new Set(['completed', 'failed', 'expired', 'cancelled', 'cleanup_pending']);

export function shouldStopGpuManifest(job: GpuManifestJobState) {
  return Boolean(job.destroyedAt || job.cancelRequested || terminalStatuses.has(job.status));
}

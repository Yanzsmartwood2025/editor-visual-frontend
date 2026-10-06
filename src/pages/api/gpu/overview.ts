import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  ACTIVE_GPU_STATUSES,
  listGpuJobsForUser,
  type GpuJobRow,
} from '../../../lib/gpu/jobStore';
import {
  sanitizeNaylaPublicText,
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../../../lib/naylaSystemCatalog';

const activeStatuses = new Set<string>(ACTIVE_GPU_STATUSES);

const elapsedSeconds = (job: GpuJobRow, now = Date.now()) => {
  const started = job.started_at ? Date.parse(job.started_at) : Number.NaN;
  if (!Number.isFinite(started)) return 0;
  const end = job.destroyed_at
    ? Date.parse(job.destroyed_at)
    : job.completed_at && !activeStatuses.has(job.status)
      ? Date.parse(job.completed_at)
      : now;
  return Math.max(0, Math.floor((end - started) / 1000));
};

const publicCost = (job: GpuJobRow, now = Date.now()) => {
  const stored = Number(job.runtime_cost_estimate);
  if (!activeStatuses.has(job.status) && Number.isFinite(stored)) {
    return toNaylaComputeEstimatedPrice(Math.max(0, stored));
  }
  const hourly = Number(job.hourly_price);
  if (!Number.isFinite(hourly)) return null;
  const seconds = elapsedSeconds(job, now);
  return toNaylaComputeEstimatedPrice(Math.max(0, hourly * (seconds / 3600)), seconds / 60);
};

const toPublicJob = (job: GpuJobRow, now: number) => {
  const hourly = Number(job.hourly_price);
  const maxCost = Number(job.estimated_max_cost);
  const request = job.metadata?.request || {};
  const progress = job.metadata?.progress || null;
  return {
    id: job.id,
    workload: job.workload,
    status: job.status,
    gpuName: job.gpu_name,
    provider: 'nayla-compute',
    backendProvider: job.provider,
    hourlyPrice: Number.isFinite(hourly) ? toNaylaComputeHourlyPrice(hourly) : null,
    estimatedMaxCost: Number.isFinite(maxCost) ? toNaylaComputeEstimatedPrice(maxCost) : null,
    currentCostEstimate: publicCost(job, now),
    elapsedSeconds: elapsedSeconds(job, now),
    progress: progress
      ? {
          percent: Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : null,
          stage: typeof progress.stage === 'string' ? sanitizeNaylaPublicText(progress.stage).slice(0, 160) : null,
          updatedAt: progress.updatedAt || null,
        }
      : null,
    recipe: typeof request.recipe === 'string' ? request.recipe : null,
    projectId: job.project_id,
    threadId: job.thread_id,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    destroyedAt: job.destroyed_at,
    leaseExpiresAt: job.lease_expires_at,
    error: job.error_message ? sanitizeNaylaPublicText(job.error_message).slice(0, 500) : null,
    active: activeStatuses.has(job.status),
    canDestroy: activeStatuses.has(job.status) && job.status !== 'cleanup_pending',
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const requestedLimit = Number(Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(10, Math.min(100, Math.floor(requestedLimit))) : 60;

  try {
    const rows = await listGpuJobsForUser({ userId: user.uid, limit });
    const now = Date.now();
    const jobs = rows.map((job) => toPublicJob(job, now));
    const active = jobs.filter((job) => job.active);
    const history = jobs.filter((job) => !job.active);
    const historyCost = history.reduce((sum, job) => sum + (job.currentCostEstimate || 0), 0);
    const activeCost = active.reduce((sum, job) => sum + (job.currentCostEstimate || 0), 0);

    return res.status(200).json({
      active,
      history,
      activeCount: active.length,
      totals: {
        activeCostEstimate: Math.round(activeCost * 1000) / 1000,
        historyCost: Math.round(historyCost * 1000) / 1000,
        completed: history.filter((job) => job.status === 'completed').length,
        failed: history.filter((job) => ['failed', 'expired'].includes(job.status)).length,
        cancelled: history.filter((job) => job.status === 'cancelled').length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el Centro GPU.';
    return res.status(500).json({ error: sanitizeNaylaPublicText(message) });
  }
}

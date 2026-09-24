
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createR2PresignedGetUrl, createR2PresignedPutUrl, createR2StorageUrl, headR2Object } from '../r2';
import {
  countActiveGpuJobs,
  getGalleryItemById,
  getGpuJob,
  getGpuJobForUser,
  getGpuSupabaseAdmin,
  insertGpuJob,
  listExpiredGpuJobs,
  updateGpuJob,
  updateGpuJobIfStatus,
  type GpuJobRow,
} from './jobStore';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
  getGpuProfile,
  type GpuWorkload,
} from './profiles';
import { buildRecipeBootstrap } from './recipes';
import { resolveGpuExecutionPlan } from './planner';
import {
  createVastInstance,
  destroyVastInstance,
  getVastAccountSummary,
  getVastInstance,
  searchVastOffers,
} from './vastApi';
import {
  sanitizeNaylaPublicText,
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../naylaSystemCatalog';
import {
  createComputeTargetSelectionId,
  findComputeTargetBySelectionId,
  findOfferByComputeSelectionId,
} from './selection';
import { getComputeCatalog, type ComputeCandidate } from './computeCatalog';
import {
  createRunpodPod,
  getRunpodPod,
  terminateRunpodPod,
} from './runpodApi';
import {
  buildVultrWorkerUserData,
  createVultrGpuInstance,
  deleteVultrInstance,
  getVultrInstance,
  parseVultrCandidateId,
} from './vultrApi';

export type GpuJobInput = {
  workload: GpuWorkload;
  recipe?: string;
  prompt?: string;
  inputUrls?: string[];
  options?: Record<string, unknown>;
  computeSelectionId?: string;
};

const tokenHash = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const normalizeAppBaseUrl = (value: string) => {
  const parsed = new URL(value);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('La URL pública de Nayla debe usar HTTPS.');
  }
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
};

const computeRuntimeCost = (job: GpuJobRow, end = new Date()) => {
  const hourly = Number(job.hourly_price);
  const started = job.started_at ? new Date(job.started_at).getTime() : Number.NaN;
  if (!Number.isFinite(hourly) || !Number.isFinite(started)) return null;
  const elapsedSeconds = Math.max(0, (end.getTime() - started) / 1000);
  const billingMinimumMinutes = Number(job.metadata?.billingMinimumMinutes || 0);
  const billedSeconds = Math.max(
    elapsedSeconds,
    Number.isFinite(billingMinimumMinutes) && billingMinimumMinutes > 0
      ? billingMinimumMinutes * 60
      : 0
  );
  return Math.ceil(hourly * (billedSeconds / 3600) * 1_000_000) / 1_000_000;
};

const getRunpodPodId = (job: GpuJobRow): string | null => {
  const value = job.metadata?.runpodPodId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getVultrInstanceId = (job: GpuJobRow): string | null => {
  const value = job.metadata?.vultrInstanceId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const hasComputeInstance = (job: GpuJobRow) => {
  if (job.provider === 'runpod') return Boolean(getRunpodPodId(job));
  if (job.provider === 'vultr') return Boolean(getVultrInstanceId(job));
  return Boolean(job.instance_id);
};

const destroyComputeInstance = async (job: GpuJobRow): Promise<void> => {
  if (job.provider === 'runpod') {
    const podId = getRunpodPodId(job);
    if (!podId) return;
    await terminateRunpodPod(podId);
    return;
  }

  if (job.provider === 'vultr') {
    const instanceId = getVultrInstanceId(job);
    if (!instanceId) return;
    await deleteVultrInstance(instanceId);
    return;
  }

  if (job.instance_id) {
    await destroyVastInstance(job.instance_id);
  }
};

const publicJob = async (job: GpuJobRow) => {
  const rawGalleryItem = job.gallery_item_id
    ? await getGalleryItemById(job.gallery_item_id)
    : null;
  const publicGalleryItem = rawGalleryItem
    ? {
        ...rawGalleryItem,
        fuente: String(rawGalleryItem.fuente || '').startsWith('gpu:')
          ? 'nayla-compute'
          : rawGalleryItem.fuente,
        metadata: {
          ...(rawGalleryItem.metadata || {}),
          ...(String(rawGalleryItem.fuente || '').startsWith('gpu:')
            ? { sourceProvider: 'nayla-compute' }
            : {}),
        },
      }
    : null;
  const galleryItem =
    publicGalleryItem?.r2_key
      ? {
          ...publicGalleryItem,
          url: createR2PresignedGetUrl({ key: publicGalleryItem.r2_key, expiresIn: 900 }).url,
        }
      : publicGalleryItem;
  const outputKey = job.metadata?.outputKey as string | null | undefined;

  const internalHourlyPrice = job.hourly_price === null ? null : Number(job.hourly_price);
  const internalEstimatedMaxCost =
    job.estimated_max_cost === null ? null : Number(job.estimated_max_cost);
  const internalRuntimeCost =
    job.runtime_cost_estimate === null ? null : Number(job.runtime_cost_estimate);

  return {
    id: job.id,
    projectId: job.project_id,
    threadId: job.thread_id,
    provider: 'nayla-compute',
    workload: job.workload,
    status: job.status,
    gpuName: job.gpu_name,
    hourlyPrice:
      internalHourlyPrice === null ? null : toNaylaComputeHourlyPrice(internalHourlyPrice),
    estimatedMaxCost:
      internalEstimatedMaxCost === null ? null : toNaylaComputeEstimatedPrice(internalEstimatedMaxCost),
    runtimeCostEstimate:
      internalRuntimeCost === null ? null : toNaylaComputeEstimatedPrice(internalRuntimeCost),
    leaseExpiresAt: job.lease_expires_at,
    outputUrl: outputKey
      ? createR2PresignedGetUrl({ key: outputKey, expiresIn: 900 }).url
      : job.output_url,
    outputContentType: job.output_content_type,
    error: job.error_message ? sanitizeNaylaPublicText(job.error_message) : null,
    galleryItem,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    destroyedAt: job.destroyed_at,
  };
};

const buildProbeOnstart = () => [
  'set -eu',
  "python - <<'PY'",
  'import json, os, subprocess, urllib.request',
  'status = "completed"',
  'error = None',
  'metadata = {}',
  'try:',
  '    output = subprocess.check_output(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], text=True, timeout=30).strip()',
  '    metadata["nvidia_smi"] = output[:2000]',
  'except Exception as exc:',
  '    status = "failed"',
  '    error = str(exc)[:1000]',
  'body = json.dumps({"jobId": os.environ["NAYLA_GPU_JOB_ID"], "status": status, "error": error, "metadata": metadata}).encode("utf-8")',
  'req = urllib.request.Request(os.environ["NAYLA_GPU_CALLBACK_URL"], data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["NAYLA_GPU_CALLBACK_TOKEN"]}, method="POST")',
  'urllib.request.urlopen(req, timeout=30).read()',
  'PY',
].join('\n');

const buildWorkerOnstart = () => [
  'set -u',
  'status="completed"',
  'error=""',
  'if [ ! -x /opt/nayla/run-job ]; then',
  '  status="failed"',
  '  error="La imagen GPU no contiene /opt/nayla/run-job"',
  'else',
  '  /opt/nayla/run-job "$NAYLA_GPU_MANIFEST_URL" || {',
  '    status="failed"',
  '    error="El worker GPU terminó con código distinto de cero"',
  '  }',
  'fi',
  'NAYLA_GPU_FINAL_STATUS="$status" NAYLA_GPU_FINAL_ERROR="$error" python - <<\'PY\'',
  'import json, os, urllib.request',
  'body = json.dumps({"jobId": os.environ["NAYLA_GPU_JOB_ID"], "status": os.environ.get("NAYLA_GPU_FINAL_STATUS", "failed"), "error": os.environ.get("NAYLA_GPU_FINAL_ERROR") or None}).encode("utf-8")',
  'req = urllib.request.Request(os.environ["NAYLA_GPU_CALLBACK_URL"], data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["NAYLA_GPU_CALLBACK_TOKEN"]}, method="POST")',
  'urllib.request.urlopen(req, timeout=30).read()',
  'PY',
].join('\n');

const workloadToGalleryType = (workload: GpuWorkload) => {
  if (workload === 'image') return 'foto';
  if (workload === 'video') return 'video';
  if (workload === 'audio') return 'audio';
  if (workload === '3d') return 'modelo3d';
  return null;
};

const workloadLabelPrefix = (workload: GpuWorkload) => {
  if (workload === 'image') return 'FG';
  if (workload === 'video') return 'VG';
  if (workload === 'audio') return 'AG';
  if (workload === '3d') return 'MG';
  return 'GPU';
};

export const cleanupExpiredComputeJobs = async () => {
  const expired = await listExpiredGpuJobs(20);
  let destroyed = 0;
  let failed = 0;

  for (const job of expired) {
    if (!hasComputeInstance(job)) continue;

    try {
      await destroyComputeInstance(job);
      const now = new Date();
      const terminalStatus =
        job.status === 'cleanup_pending' &&
        (job.metadata?.terminalStatus === 'completed' || job.metadata?.terminalStatus === 'failed')
          ? job.metadata.terminalStatus
          : 'expired';

      await updateGpuJob(job.id, {
        status: terminalStatus,
        error_message:
          terminalStatus === 'completed'
            ? null
            : (job.error_message ||
              'La GPU superó el tiempo máximo asignado y Nayla la destruyó automáticamente.'),
        completed_at: job.completed_at || now.toISOString(),
        destroyed_at: now.toISOString(),
        runtime_cost_estimate: computeRuntimeCost(job, now),
      });
      destroyed += 1;
    } catch (error) {
      failed += 1;
      await updateGpuJob(job.id, {
        status: 'cleanup_pending',
        error_message: (
          error instanceof Error ? error.message : 'Error destruyendo GPU'
        ).slice(0, 2000),
      }).catch(() => undefined);
    }
  }

  return { checked: expired.length, destroyed, failed };
};

// Backward-compatible export for the existing cron route while callers migrate.
export const cleanupExpiredVastJobs = cleanupExpiredComputeJobs;

export const startVastGpuJob = async ({
  userId,
  projectId,
  threadId,
  input,
  appBaseUrl,
}: {
  userId: string;
  projectId?: string;
  threadId?: string;
  input: GpuJobInput;
  appBaseUrl: string;
}) => {
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const { profile, recipePlan, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  if (!workerImage) {
    throw new Error(
      'La máquina para ' + input.workload +
      ' está preparada, pero falta configurar su imagen worker en Vercel. Nayla no rentará una GPU hasta tener un worker válido.'
    );
  }

  await cleanupExpiredComputeJobs().catch((error) => {
    console.warn('[gpu] No se pudo completar la limpieza preventiva:', error);
  });

  const activeJobs = await countActiveGpuJobs();
  if (activeJobs >= policy.maxConcurrentJobs) {
    throw new Error(
      'Ya hay ' + activeJobs + ' trabajo GPU activo. Para proteger el saldo, Nayla solo permite ' +
      policy.maxConcurrentJobs + ' a la vez.'
    );
  }

  const [account, offers] = await Promise.all([
    getVastAccountSummary(),
    searchVastOffers(profile, policy.offerReliabilityMin),
  ]);

  const offer = findOfferByComputeSelectionId(offers, input.computeSelectionId);
  if (!offer) {
    throw new Error(
      input.computeSelectionId
        ? 'La GPU seleccionada ya no está disponible. Vuelve a cotizar y elige otra tarjeta.'
        : 'No encontré una GPU compatible para ' + input.workload + '.'
    );
  }

  const hourlyPrice = Number(offer.dph_total);
  const estimatedMaxCost = estimatedWorstCaseCost(
    hourlyPrice,
    profile.maxRuntimeMinutes + policy.bootGraceMinutes,
    policy.safetyMultiplier
  );

  if (hourlyPrice > profile.maxHourlyUsd) {
    throw new Error(
      'La GPU seleccionada supera el límite por hora configurado para este tipo de trabajo. ' +
      'No se reservó ninguna máquina.'
    );
  }

  if (estimatedMaxCost > policy.maxJobUsd) {
    throw new Error(
      'La GPU seleccionada excede el límite por trabajo ($' +
      estimatedMaxCost.toFixed(3) + ' > $' + policy.maxJobUsd.toFixed(2) +
      '). No se alquiló ninguna máquina.'
    );
  }

  if (account.balance - estimatedMaxCost < policy.minBalanceReserveUsd) {
    throw new Error(
      'Saldo protegido: el trabajo podría dejar menos de $' +
      policy.minBalanceReserveUsd.toFixed(2) +
      ' de reserva. No se alquiló ninguna GPU.'
    );
  }

  const callbackToken = randomBytes(32).toString('base64url');
  const leaseExpiresAt = new Date(
    Date.now() + (profile.maxRuntimeMinutes + policy.bootGraceMinutes) * 60_000
  );

  let job = await insertGpuJob({
    user_id: userId,
    project_id: projectId || null,
    thread_id: threadId || null,
    provider: 'vast',
    workload: input.workload,
    status: 'renting',
    offer_id: Number(offer.id),
    gpu_name: typeof offer.gpu_name === 'string' ? offer.gpu_name : null,
    hourly_price: hourlyPrice,
    estimated_max_cost: estimatedMaxCost,
    balance_before: account.balance,
    lease_expires_at: leaseExpiresAt.toISOString(),
    callback_token_hash: tokenHash(callbackToken),
    metadata: {
      request: {
        recipe: input.recipe || 'default',
        prompt: input.prompt || null,
        inputUrls: input.inputUrls || [],
        options: input.options || {},
        computeSelectionId: input.computeSelectionId || null,
      },
      profile: {
        minGpuRamGb: profile.minGpuRamGb,
        diskGb: profile.diskGb,
        maxHourlyUsd: profile.maxHourlyUsd,
        maxRuntimeMinutes: profile.maxRuntimeMinutes,
      },
      recipePlan: recipePlan
        ? {
            id: recipePlan.id,
            label: recipePlan.label,
          }
        : null,
    },
  });

  const outputKey =
    profile.outputExtension
      ? userId +
        '/projects/' + (projectId || 'unfiled') +
        '/' + (threadId ? 'threads/' + threadId : 'shared') +
        '/gpu/' + input.workload + '/' +
        job.id + '.' + profile.outputExtension
      : null;

  const outputUrl = outputKey ? createR2StorageUrl(outputKey) : null;

  job = await updateGpuJob(job.id, {
    output_url: outputUrl,
    output_content_type: profile.outputContentType || null,
    metadata: {
      ...job.metadata,
      outputKey,
    },
  });

  const manifestUrl =
    baseUrl + '/api/gpu/manifest?jobId=' + encodeURIComponent(job.id);
  const callbackUrl = baseUrl + '/api/gpu/callback';
  const label =
    'nayla-gpu-' + input.workload + '-' + job.id.slice(0, 8);

  try {
    const instance = await createVastInstance({
      offerId: Number(offer.id),
      image: workerImage,
      diskGb: profile.diskGb,
      label,
      onstart:
        input.workload === 'probe'
          ? buildProbeOnstart()
          : recipePlan
            ? buildRecipeBootstrap(recipePlan) + '\n' + buildWorkerOnstart()
            : buildWorkerOnstart(),
      env: {
        NAYLA_GPU_JOB_ID: job.id,
        NAYLA_GPU_MANIFEST_URL: manifestUrl,
        NAYLA_GPU_CALLBACK_URL: callbackUrl,
        NAYLA_GPU_CALLBACK_TOKEN: callbackToken,
      },
    });

    const bootingJob = await updateGpuJobIfStatus(job.id, 'renting', {
      instance_id: instance.instanceId,
      status: 'booting',
      started_at: new Date().toISOString(),
      metadata: {
        ...job.metadata,
        offer: {
          id: Number(offer.id),
          gpuName: offer.gpu_name || null,
          gpuRamMb: Number(offer.gpu_ram) || null,
          reliability: Number(offer.reliability) || null,
          inetDown: Number(offer.inet_down) || null,
        },
      },
    });

    if (bootingJob) {
      job = bootingJob;
    } else {
      // El worker pudo terminar durante los pocos milisegundos entre crear la
      // instancia y guardar su ID. No revivimos el job: destruimos la GPU ya.
      await destroyVastInstance(instance.instanceId);
      job = await updateGpuJob(job.id, {
        instance_id: instance.instanceId,
        destroyed_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    await updateGpuJob(job.id, {
      status: 'failed',
      error_message: (
        error instanceof Error ? error.message : 'No se pudo crear la instancia GPU'
      ).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }

  return publicJob(job);
};


const startRunpodGpuJob = async ({
  userId,
  projectId,
  threadId,
  input,
  appBaseUrl,
  candidate,
}: {
  userId: string;
  projectId?: string;
  threadId?: string;
  input: GpuJobInput;
  appBaseUrl: string;
  candidate: ComputeCandidate;
}) => {
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const { profile, recipePlan, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  if (!workerImage) {
    throw new Error(
      'La máquina para ' + input.workload +
      ' está preparada, pero falta configurar su imagen worker en Vercel. Nayla no rentará una GPU hasta tener un worker válido.'
    );
  }

  const hourlyPrice = candidate.hourlyPrice;
  const estimatedMaxCost = estimatedWorstCaseCost(
    hourlyPrice,
    profile.maxRuntimeMinutes + policy.bootGraceMinutes,
    policy.safetyMultiplier
  );

  if (hourlyPrice > profile.maxHourlyUsd) {
    throw new Error(
      'La GPU seleccionada supera el límite por hora configurado para este tipo de trabajo. No se reservó ninguna máquina.'
    );
  }
  if (estimatedMaxCost > policy.maxJobUsd) {
    throw new Error(
      'La GPU seleccionada supera el tope configurado por trabajo. No se reservó ninguna máquina.'
    );
  }
  if (candidate.balanceUsd - estimatedMaxCost < policy.minBalanceReserveUsd) {
    throw new Error(
      'Saldo protegido: la GPU seleccionada no entra dentro de la reserva mínima de Nayla Compute.'
    );
  }

  const callbackToken = randomBytes(32).toString('base64url');
  const leaseExpiresAt = new Date(
    Date.now() + (profile.maxRuntimeMinutes + policy.bootGraceMinutes) * 60_000
  );

  let job = await insertGpuJob({
    user_id: userId,
    project_id: projectId || null,
    thread_id: threadId || null,
    provider: 'runpod',
    workload: input.workload,
    status: 'renting',
    offer_id: null,
    gpu_name: candidate.gpuName,
    hourly_price: hourlyPrice,
    estimated_max_cost: estimatedMaxCost,
    balance_before: candidate.balanceUsd,
    lease_expires_at: leaseExpiresAt.toISOString(),
    callback_token_hash: tokenHash(callbackToken),
    metadata: {
      request: {
        recipe: input.recipe || 'default',
        prompt: input.prompt || null,
        inputUrls: input.inputUrls || [],
        options: input.options || {},
        computeSelectionId: input.computeSelectionId || null,
      },
      profile: {
        minGpuRamGb: profile.minGpuRamGb,
        diskGb: profile.diskGb,
        maxHourlyUsd: profile.maxHourlyUsd,
        maxRuntimeMinutes: profile.maxRuntimeMinutes,
      },
      recipePlan: recipePlan
        ? { id: recipePlan.id, label: recipePlan.label }
        : null,
      runpodGpuTypeId: candidate.backendId,
    },
  });

  const outputKey =
    profile.outputExtension
      ? userId +
        '/projects/' + (projectId || 'unfiled') +
        '/' + (threadId ? 'threads/' + threadId : 'shared') +
        '/gpu/' + input.workload + '/' +
        job.id + '.' + profile.outputExtension
      : null;

  job = await updateGpuJob(job.id, {
    output_url: outputKey ? createR2StorageUrl(outputKey) : null,
    output_content_type: profile.outputContentType || null,
    metadata: { ...job.metadata, outputKey },
  });

  const manifestUrl =
    baseUrl + '/api/gpu/manifest?jobId=' + encodeURIComponent(job.id);
  const callbackUrl = baseUrl + '/api/gpu/callback';
  const label = 'nayla-gpu-' + input.workload + '-' + job.id.slice(0, 8);
  const onstart =
    input.workload === 'probe'
      ? buildProbeOnstart()
      : recipePlan
        ? buildRecipeBootstrap(recipePlan) + '\n' + buildWorkerOnstart()
        : buildWorkerOnstart();

  try {
    const pod = await createRunpodPod({
      gpuTypeId: candidate.backendId,
      imageName: workerImage,
      diskGb: profile.diskGb,
      name: label,
      onstart,
      env: {
        NAYLA_GPU_JOB_ID: job.id,
        NAYLA_GPU_MANIFEST_URL: manifestUrl,
        NAYLA_GPU_CALLBACK_URL: callbackUrl,
        NAYLA_GPU_CALLBACK_TOKEN: callbackToken,
      },
      terminateAfter: leaseExpiresAt,
    });

    const actualHourly = Number(pod.costPerHr);
    if (
      Number.isFinite(actualHourly) &&
      actualHourly > hourlyPrice + 0.0001
    ) {
      await terminateRunpodPod(pod.id).catch(() => undefined);
      throw new Error(
        'El precio de la GPU cambió antes de reservarla. Nayla canceló la operación para evitar un cargo distinto al confirmado.'
      );
    }

    const effectiveHourly =
      Number.isFinite(actualHourly) && actualHourly > 0
        ? actualHourly
        : hourlyPrice;
    const effectiveEstimate = estimatedWorstCaseCost(
      effectiveHourly,
      profile.maxRuntimeMinutes + policy.bootGraceMinutes,
      policy.safetyMultiplier
    );

    if (
      effectiveHourly > profile.maxHourlyUsd ||
      effectiveEstimate > policy.maxJobUsd
    ) {
      await terminateRunpodPod(pod.id).catch(() => undefined);
      throw new Error(
        'La GPU cambió fuera de los límites de gasto antes de reservarla. Nayla canceló la operación.'
      );
    }

    const bootingJob = await updateGpuJobIfStatus(job.id, 'renting', {
      status: 'booting',
      started_at: new Date().toISOString(),
      hourly_price: effectiveHourly,
      estimated_max_cost: effectiveEstimate,
      metadata: {
        ...job.metadata,
        runpodPodId: pod.id,
        runpodRuntime: {
          desiredStatus: pod.desiredStatus || null,
          lastStatusChange: pod.lastStatusChange || null,
          checkedAt: new Date().toISOString(),
        },
      },
    });

    if (bootingJob) {
      job = bootingJob;
    } else {
      await terminateRunpodPod(pod.id).catch(() => undefined);
      job = await updateGpuJob(job.id, {
        destroyed_at: new Date().toISOString(),
        metadata: { ...job.metadata, runpodPodId: pod.id },
      });
    }
  } catch (error) {
    await updateGpuJob(job.id, {
      status: 'failed',
      error_message: (
        error instanceof Error ? error.message : 'No se pudo crear la GPU'
      ).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }

  return publicJob(job);
};


const startVultrGpuJob = async ({
  userId,
  projectId,
  threadId,
  input,
  appBaseUrl,
  candidate,
}: {
  userId: string;
  projectId?: string;
  threadId?: string;
  input: GpuJobInput;
  appBaseUrl: string;
  candidate: ComputeCandidate;
}) => {
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const { profile, recipePlan, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  if (!workerImage) {
    throw new Error(
      'La máquina para ' + input.workload +
      ' está preparada, pero falta configurar su imagen worker en Vercel.'
    );
  }

  const target = parseVultrCandidateId(candidate.backendId);
  if (!target) {
    throw new Error('La GPU seleccionada ya no tiene una ubicación válida.');
  }

  const hourlyPrice = candidate.hourlyPrice;
  const billedRuntimeMinutes = Math.max(
    profile.maxRuntimeMinutes + policy.bootGraceMinutes,
    Number(candidate.billingMinimumMinutes || 0)
  );
  const estimatedMaxCost = estimatedWorstCaseCost(
    hourlyPrice,
    billedRuntimeMinutes,
    policy.safetyMultiplier
  );

  if (hourlyPrice > profile.maxHourlyUsd) {
    throw new Error(
      'La GPU seleccionada supera el límite por hora configurado para este tipo de trabajo.'
    );
  }
  if (estimatedMaxCost > policy.maxJobUsd) {
    throw new Error(
      'La GPU seleccionada supera el tope configurado por trabajo.'
    );
  }
  if (candidate.balanceUsd - estimatedMaxCost < policy.minBalanceReserveUsd) {
    throw new Error(
      'Saldo protegido: la GPU seleccionada no entra dentro de la reserva mínima de Nayla Compute.'
    );
  }

  const callbackToken = randomBytes(32).toString('base64url');
  const leaseExpiresAt = new Date(
    Date.now() + (profile.maxRuntimeMinutes + policy.bootGraceMinutes) * 60_000
  );

  let job = await insertGpuJob({
    user_id: userId,
    project_id: projectId || null,
    thread_id: threadId || null,
    provider: 'vultr',
    workload: input.workload,
    status: 'renting',
    offer_id: null,
    gpu_name: candidate.gpuName,
    hourly_price: hourlyPrice,
    estimated_max_cost: estimatedMaxCost,
    balance_before: candidate.balanceUsd,
    lease_expires_at: leaseExpiresAt.toISOString(),
    callback_token_hash: tokenHash(callbackToken),
    metadata: {
      request: {
        recipe: input.recipe || 'default',
        prompt: input.prompt || null,
        inputUrls: input.inputUrls || [],
        options: input.options || {},
        computeSelectionId: input.computeSelectionId || null,
      },
      profile: {
        minGpuRamGb: profile.minGpuRamGb,
        diskGb: profile.diskGb,
        maxHourlyUsd: profile.maxHourlyUsd,
        maxRuntimeMinutes: profile.maxRuntimeMinutes,
      },
      recipePlan: recipePlan
        ? { id: recipePlan.id, label: recipePlan.label }
        : null,
      vultrPlanId: target.planId,
      vultrRegionId: target.regionId,
      regionLabel: candidate.regionLabel || null,
      billingMinimumMinutes: Number(candidate.billingMinimumMinutes || 60),
      includedStorageGb: candidate.includedStorageGb || null,
      includedBandwidthGb: candidate.includedBandwidthGb || null,
      linkSpeedMbps: candidate.linkSpeedMbps || null,
    },
  });

  const outputKey =
    profile.outputExtension
      ? userId +
        '/projects/' + (projectId || 'unfiled') +
        '/' + (threadId ? 'threads/' + threadId : 'shared') +
        '/gpu/' + input.workload + '/' +
        job.id + '.' + profile.outputExtension
      : null;

  job = await updateGpuJob(job.id, {
    output_url: outputKey ? createR2StorageUrl(outputKey) : null,
    output_content_type: profile.outputContentType || null,
    metadata: { ...job.metadata, outputKey },
  });

  const manifestUrl =
    baseUrl + '/api/gpu/manifest?jobId=' + encodeURIComponent(job.id);
  const callbackUrl = baseUrl + '/api/gpu/callback';
  const label = 'nayla-gpu-' + input.workload + '-' + job.id.slice(0, 8);
  const onstart =
    input.workload === 'probe'
      ? buildProbeOnstart()
      : recipePlan
        ? buildRecipeBootstrap(recipePlan) + '\n' + buildWorkerOnstart()
        : buildWorkerOnstart();

  const userData = buildVultrWorkerUserData({
    imageName: workerImage,
    onstart,
    env: {
      NAYLA_GPU_JOB_ID: job.id,
      NAYLA_GPU_MANIFEST_URL: manifestUrl,
      NAYLA_GPU_CALLBACK_URL: callbackUrl,
      NAYLA_GPU_CALLBACK_TOKEN: callbackToken,
    },
  });

  try {
    const instance = await createVultrGpuInstance({
      planId: target.planId,
      regionId: target.regionId,
      label,
      userData,
    });

    const bootingJob = await updateGpuJobIfStatus(job.id, 'renting', {
      status: 'booting',
      started_at: new Date().toISOString(),
      metadata: {
        ...job.metadata,
        vultrInstanceId: instance.id,
        vultrRuntime: {
          status: instance.status || null,
          powerStatus: instance.power_status || null,
          serverStatus: instance.server_status || null,
          checkedAt: new Date().toISOString(),
        },
      },
    });

    if (bootingJob) {
      job = bootingJob;
    } else {
      await deleteVultrInstance(instance.id).catch(() => undefined);
      job = await updateGpuJob(job.id, {
        destroyed_at: new Date().toISOString(),
        metadata: { ...job.metadata, vultrInstanceId: instance.id },
      });
    }
  } catch (error) {
    await updateGpuJob(job.id, {
      status: 'failed',
      error_message: (
        error instanceof Error ? error.message : 'No se pudo crear la GPU'
      ).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }

  return publicJob(job);
};

export const startComputeGpuJob = async ({
  userId,
  projectId,
  threadId,
  input,
  appBaseUrl,
}: {
  userId: string;
  projectId?: string;
  threadId?: string;
  input: GpuJobInput;
  appBaseUrl: string;
}) => {
  const { profile, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  if (!workerImage) {
    throw new Error(
      'Esta capacidad todavía no tiene un worker GPU compatible configurado.'
    );
  }

  await cleanupExpiredComputeJobs().catch((error) => {
    console.warn('[gpu] No se pudo completar la limpieza preventiva:', error);
  });

  const activeJobs = await countActiveGpuJobs();
  if (activeJobs >= policy.maxConcurrentJobs) {
    throw new Error(
      'Ya existe un trabajo GPU activo. Nayla espera a que termine antes de reservar otra tarjeta.'
    );
  }

  const catalog = await getComputeCatalog({
    profile,
    minReliability: policy.offerReliabilityMin,
  });

  const estimatedFor = (candidate: ComputeCandidate) =>
    estimatedWorstCaseCost(
      candidate.hourlyPrice,
      Math.max(
        profile.maxRuntimeMinutes + policy.bootGraceMinutes,
        Number(candidate.billingMinimumMinutes || 0)
      ),
      policy.safetyMultiplier
    );

  const isAllowed = (candidate: ComputeCandidate) => {
    const estimate = estimatedFor(candidate);
    return (
      candidate.hourlyPrice <= profile.maxHourlyUsd &&
      estimate <= policy.maxJobUsd &&
      candidate.balanceUsd - estimate >= policy.minBalanceReserveUsd
    );
  };

  const selected = input.computeSelectionId
    ? findComputeTargetBySelectionId(catalog.candidates, input.computeSelectionId)
    : catalog.candidates.find(isAllowed) || null;

  if (!selected) {
    throw new Error(
      input.computeSelectionId
        ? 'La GPU seleccionada ya no está disponible. Vuelve a cotizar y elige otra tarjeta.'
        : 'No encontré una GPU compatible dentro de los límites actuales de Nayla Compute.'
    );
  }

  if (!isAllowed(selected)) {
    throw new Error(
      'La GPU seleccionada ya no entra dentro de los límites protegidos de Nayla Compute.'
    );
  }

  const exactSelectionId = createComputeTargetSelectionId(selected);
  const exactInput: GpuJobInput = {
    ...input,
    computeSelectionId: exactSelectionId,
  };

  if (selected.backend === 'vast') {
    return startVastGpuJob({
      userId,
      projectId,
      threadId,
      input: exactInput,
      appBaseUrl,
    });
  }

  if (selected.backend === 'vultr') {
    return startVultrGpuJob({
      userId,
      projectId,
      threadId,
      input: exactInput,
      appBaseUrl,
      candidate: selected,
    });
  }

  return startRunpodGpuJob({
    userId,
    projectId,
    threadId,
    input: exactInput,
    appBaseUrl,
    candidate: selected,
  });
};

export const getGpuManifest = async ({
  jobId,
  token,
}: {
  jobId: string;
  token: string;
}) => {
  const job = await getGpuJob(jobId);
  if (!job || !job.callback_token_hash) {
    throw new Error('Trabajo GPU no encontrado.');
  }

  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(job.callback_token_hash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Token GPU inválido.');
  }

  if (
    job.lease_expires_at &&
    new Date(job.lease_expires_at).getTime() < Date.now()
  ) {
    throw new Error('El lease GPU ya expiró.');
  }

  const profile = getGpuProfile(job.workload as GpuWorkload);
  const outputKey = job.metadata?.outputKey as string | null | undefined;
  const outputUpload =
    outputKey && profile.outputContentType
      ? createR2PresignedPutUrl({
          key: outputKey,
          contentType: profile.outputContentType,
          expiresIn: 3600,
        })
      : null;

  await updateGpuJob(job.id, { status: 'processing' }).catch(() => undefined);

  return {
    jobId: job.id,
    workload: job.workload,
    recipe: job.metadata?.request?.recipe || 'default',
    prompt: job.metadata?.request?.prompt || null,
    inputUrls: job.metadata?.request?.inputUrls || [],
    options: job.metadata?.request?.options || {},
    deadline: job.lease_expires_at,
    output: outputUpload
      ? {
          uploadUrl: outputUpload.uploadUrl,
          publicUrl: createR2PresignedGetUrl({
            key: outputUpload.key,
            expiresIn: 3600,
          }).url,
          contentType: outputUpload.contentType,
          key: outputUpload.key,
        }
      : null,
  };
};

export const finishGpuJob = async ({
  jobId,
  token,
  status,
  error,
  metadata,
}: {
  jobId: string;
  token: string;
  status: 'completed' | 'failed';
  error?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  let job = await getGpuJob(jobId);
  if (!job || !job.callback_token_hash) {
    throw new Error('Trabajo GPU no encontrado.');
  }

  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(job.callback_token_hash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Token GPU inválido.');
  }

  if (job.metadata?.cancelRequested || ['completed', 'failed', 'expired'].includes(job.status)) {
    return publicJob(job);
  }

  const now = new Date();
  let finalStatus: 'completed' | 'failed' = status;
  let finalError = error?.slice(0, 2000) || null;
  let galleryItemId: string | null = job.gallery_item_id;
  const workload = job.workload as GpuWorkload;
  const outputKey = job.metadata?.outputKey as string | null | undefined;

  try {
    if (status === 'completed' && workload !== 'probe') {
      if (!outputKey || !job.output_url) {
        throw new Error('El trabajo GPU terminó sin una salida R2 preparada.');
      }

      const head = await headR2Object(outputKey);
      const galleryType = workloadToGalleryType(workload);
      if (!galleryType) {
        throw new Error('Tipo de salida GPU no soportado.');
      }

      const supabase = getGpuSupabaseAdmin();
      const prefix = workloadLabelPrefix(workload);
      let countQuery = supabase
        .from('galeria_multimedia')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', job.user_id)
        .eq('tipo', galleryType);
      if (job.project_id) countQuery = countQuery.eq('project_id', job.project_id);
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const galleryItem = {
        id: randomUUID(),
        user_id: job.user_id,
        project_id: job.project_id,
        thread_id: job.thread_id,
        url: createR2StorageUrl(outputKey),
        r2_key: outputKey,
        privacy: 'private',
        tipo: galleryType,
        nombre:
          'Nayla GPU ' + workload + ' ' + job.id.slice(0, 8) + '.' +
          (getGpuProfile(workload).outputExtension || 'bin'),
        creado_en: now.toISOString(),
        esOverlay: false,
        etiqueta: prefix + ((count || 0) + 1),
        fuente: 'nayla-compute',
        metadata: {
          sourceProvider: 'nayla-compute',
          gpuJobId: job.id,
          gpuName: job.gpu_name,
          recipe: job.metadata?.request?.recipe || 'default',
          contentType: head.contentType || job.output_content_type,
          contentLength: head.contentLength || null,
          workerMetadata: metadata || {},
        },
      };

      const { data: inserted, error: insertError } = await supabase
        .from('galeria_multimedia')
        .insert(galleryItem)
        .select('id')
        .single();
      if (insertError) throw insertError;
      galleryItemId = inserted.id as string;
    }
  } catch (outputError) {
    finalStatus = 'failed';
    finalError = (
      outputError instanceof Error ? outputError.message : 'Salida GPU inválida'
    ).slice(0, 2000);
  }

  const runtimeCost = computeRuntimeCost(job, now);

  job = await updateGpuJob(job.id, {
    status: finalStatus,
    error_message:
      finalStatus === 'failed' ? finalError || 'El worker GPU falló.' : null,
    gallery_item_id: galleryItemId,
    runtime_cost_estimate: runtimeCost,
    completed_at: now.toISOString(),
    metadata: {
      ...job.metadata,
      callbackMetadata: metadata || {},
    },
  });

  if (hasComputeInstance(job)) {
    try {
      await destroyComputeInstance(job);
      job = await updateGpuJob(job.id, {
        destroyed_at: new Date().toISOString(),
      });
    } catch (destroyError) {
      job = await updateGpuJob(job.id, {
        status: 'cleanup_pending',
        error_message:
          finalStatus === 'completed'
            ? 'La salida terminó, pero la GPU quedó pendiente de destrucción automática.'
            : (job.error_message || 'El trabajo falló y la GPU quedó pendiente de destrucción automática.'),
        lease_expires_at: new Date(Date.now() - 1000).toISOString(),
        metadata: {
          ...job.metadata,
          terminalStatus: finalStatus,
        },
      });
      console.error('[gpu] Error destruyendo instancia tras callback:', destroyError);
    }
  }

  return publicJob(job);
};

const hasStartupError = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = value.toLowerCase();
  return [
    'error',
    'failed',
    'failure',
    'exception',
    'traceback',
    'oci runtime',
    'permission denied',
  ].some((token) => normalized.includes(token));
};

export const getGpuJobStatusForUser = async ({
  jobId,
  userId,
}: {
  jobId: string;
  userId: string;
}) => {
  let job = await getGpuJobForUser(jobId, userId);
  if (!job) return null;

  const terminal = ['completed', 'failed', 'expired'];
  if (terminal.includes(job.status) || !hasComputeInstance(job)) {
    return publicJob(job);
  }

  if (job.provider === 'runpod') {
    const podId = getRunpodPodId(job);
    if (!podId) return publicJob(job);

    try {
      const pod = await getRunpodPod(podId);
      const latest = await getGpuJobForUser(jobId, userId);
      if (!latest) return null;
      job = latest;

      if (terminal.includes(job.status)) {
        return publicJob(job);
      }

      if (!pod) {
        const now = new Date();
        job = await updateGpuJob(job.id, {
          status: 'failed',
          error_message:
            'Nayla Compute dejó de reportar la instancia antes de completar el trabajo.',
          completed_at: now.toISOString(),
          destroyed_at: now.toISOString(),
          runtime_cost_estimate: computeRuntimeCost(job, now),
        });
        return publicJob(job);
      }

      const desiredStatus = String(pod.desiredStatus || 'unknown').toUpperCase();
      const runtimeMetadata = {
        ...job.metadata,
        runpodRuntime: {
          desiredStatus,
          lastStatusChange: pod.lastStatusChange || null,
          checkedAt: new Date().toISOString(),
        },
      };

      const stopped = ['EXITED', 'DEAD', 'TERMINATED', 'STOPPED'].includes(
        desiredStatus
      );

      if (stopped) {
        const now = new Date();
        job = await updateGpuJob(job.id, {
          status: 'failed',
          error_message:
            'La GPU terminó antes de que el worker confirmara el resultado. Nayla activó la limpieza.',
          completed_at: now.toISOString(),
          destroyed_at: now.toISOString(),
          runtime_cost_estimate: computeRuntimeCost(job, now),
          metadata: runtimeMetadata,
        });
        return publicJob(job);
      }

      if (
        desiredStatus === 'RUNNING' &&
        (job.status === 'renting' || job.status === 'booting')
      ) {
        const updated = await updateGpuJobIfStatus(job.id, job.status, {
          status: 'running',
          metadata: runtimeMetadata,
        });
        if (updated) job = updated;
        return publicJob(job);
      }

      job = await updateGpuJob(job.id, {
        metadata: runtimeMetadata,
      });
    } catch (error) {
      console.warn('[gpu] No se pudo reconciliar una instancia Nayla Compute:', error);
    }

    return publicJob(job);
  }

  if (job.provider === 'vultr') {
    const instanceId = getVultrInstanceId(job);
    if (!instanceId) return publicJob(job);

    try {
      const instance = await getVultrInstance(instanceId);
      const latest = await getGpuJobForUser(jobId, userId);
      if (!latest) return null;
      job = latest;

      if (terminal.includes(job.status)) {
        return publicJob(job);
      }

      if (!instance) {
        const now = new Date();
        job = await updateGpuJob(job.id, {
          status: 'failed',
          error_message:
            'Nayla Compute dejó de reportar la instancia antes de completar el trabajo.',
          completed_at: now.toISOString(),
          destroyed_at: now.toISOString(),
          runtime_cost_estimate: computeRuntimeCost(job, now),
        });
        return publicJob(job);
      }

      const status = String(instance.status || 'unknown').toLowerCase();
      const powerStatus = String(instance.power_status || 'unknown').toLowerCase();
      const serverStatus = String(instance.server_status || 'unknown').toLowerCase();
      const runtimeMetadata = {
        ...job.metadata,
        vultrRuntime: {
          status,
          powerStatus,
          serverStatus,
          mainIp: instance.main_ip || null,
          checkedAt: new Date().toISOString(),
        },
      };

      const stopped =
        ['stopped', 'suspended', 'terminated', 'destroyed'].includes(status) ||
        ['stopped', 'off'].includes(powerStatus);

      if (stopped) {
        const now = new Date();
        let destroyedAt: string | null = null;
        try {
          await deleteVultrInstance(instanceId);
          destroyedAt = new Date().toISOString();
        } catch (destroyError) {
          console.error('[gpu] No se pudo destruir una GPU detenida:', destroyError);
        }

        job = await updateGpuJob(job.id, {
          status: destroyedAt ? 'failed' : 'cleanup_pending',
          error_message:
            'La GPU terminó antes de que el worker confirmara el resultado. Nayla activó la limpieza.',
          completed_at: now.toISOString(),
          destroyed_at: destroyedAt,
          runtime_cost_estimate: computeRuntimeCost(job, now),
          lease_expires_at: destroyedAt
            ? job.lease_expires_at
            : new Date(Date.now() - 1000).toISOString(),
          metadata: {
            ...runtimeMetadata,
            terminalStatus: 'failed',
          },
        });
        return publicJob(job);
      }

      if (
        status === 'active' &&
        (powerStatus === 'running' || serverStatus === 'ok') &&
        (job.status === 'renting' || job.status === 'booting')
      ) {
        const updated = await updateGpuJobIfStatus(job.id, job.status, {
          status: 'running',
          metadata: runtimeMetadata,
        });
        if (updated) job = updated;
        return publicJob(job);
      }

      job = await updateGpuJob(job.id, {
        metadata: runtimeMetadata,
      });
    } catch (error) {
      console.warn('[gpu] No se pudo reconciliar una instancia Nayla Compute:', error);
    }

    return publicJob(job);
  }

  try {
    const instance = job.instance_id
      ? await getVastInstance(job.instance_id)
      : null;
    const latest = await getGpuJobForUser(jobId, userId);
    if (!latest) return null;
    job = latest;

    if (terminal.includes(job.status)) {
      return publicJob(job);
    }

    if (!instance) {
      const now = new Date();
      job = await updateGpuJob(job.id, {
        status: 'failed',
        error_message:
          'Nayla Compute dejó de reportar la instancia antes de completar el trabajo.',
        completed_at: now.toISOString(),
        destroyed_at: now.toISOString(),
        runtime_cost_estimate: computeRuntimeCost(job, now),
      });
      return publicJob(job);
    }

    const actualStatus =
      typeof instance.actual_status === 'string'
        ? instance.actual_status
        : 'unknown';
    const intendedStatus =
      typeof instance.intended_status === 'string'
        ? instance.intended_status
        : 'unknown';
    const statusMessage =
      typeof instance.status_msg === 'string'
        ? instance.status_msg.trim().slice(0, 1000)
        : '';

    const runtimeMetadata = {
      ...job.metadata,
      vastRuntime: {
        actualStatus,
        intendedStatus,
        statusMessage: statusMessage || null,
        checkedAt: new Date().toISOString(),
      },
    };

    const stopped =
      ['offline', 'stopped', 'exited', 'destroyed', 'terminated'].includes(actualStatus) ||
      ['offline', 'stopped', 'exited', 'destroyed', 'terminated'].includes(intendedStatus);

    if (hasStartupError(statusMessage) || stopped) {
      const now = new Date();
      let destroyedAt: string | null = null;
      try {
        await destroyComputeInstance(job);
        destroyedAt = new Date().toISOString();
      } catch (destroyError) {
        console.error(
          '[gpu] No se pudo destruir la instancia tras fallo de arranque:',
          destroyError
        );
      }

      job = await updateGpuJob(job.id, {
        status: destroyedAt ? 'failed' : 'cleanup_pending',
        error_message:
          statusMessage ||
          'La instancia no alcanzó un estado ejecutable y Nayla activó la limpieza.',
        completed_at: now.toISOString(),
        destroyed_at: destroyedAt,
        runtime_cost_estimate: computeRuntimeCost(job, now),
        lease_expires_at: destroyedAt
          ? job.lease_expires_at
          : new Date(Date.now() - 1000).toISOString(),
        metadata: {
          ...runtimeMetadata,
          terminalStatus: 'failed',
        },
      });
      return publicJob(job);
    }

    if (
      actualStatus === 'running' &&
      intendedStatus === 'running' &&
      (job.status === 'renting' || job.status === 'booting')
    ) {
      const updated = await updateGpuJobIfStatus(job.id, job.status, {
        status: 'running',
        metadata: runtimeMetadata,
      });
      if (updated) job = updated;
      return publicJob(job);
    }

    job = await updateGpuJob(job.id, {
      metadata: runtimeMetadata,
    });
  } catch (error) {
    console.warn('[gpu] No se pudo reconciliar el estado de Nayla Compute:', error);
  }

  return publicJob(job);
};


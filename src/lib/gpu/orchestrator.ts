
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createR2PresignedPutUrl, headR2Object } from '../r2';
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
import {
  createVastInstance,
  destroyVastInstance,
  getVastAccountSummary,
  getVastInstance,
  searchVastOffers,
} from './vastApi';

export type GpuJobInput = {
  workload: GpuWorkload;
  recipe?: string;
  prompt?: string;
  inputUrls?: string[];
  options?: Record<string, unknown>;
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
  const seconds = Math.max(0, (end.getTime() - started) / 1000);
  return Math.ceil(hourly * (seconds / 3600) * 1_000_000) / 1_000_000;
};

const publicJob = async (job: GpuJobRow) => {
  const galleryItem = job.gallery_item_id
    ? await getGalleryItemById(job.gallery_item_id)
    : null;

  return {
    id: job.id,
    provider: job.provider,
    workload: job.workload,
    status: job.status,
    gpuName: job.gpu_name,
    hourlyPrice: job.hourly_price === null ? null : Number(job.hourly_price),
    estimatedMaxCost:
      job.estimated_max_cost === null ? null : Number(job.estimated_max_cost),
    runtimeCostEstimate:
      job.runtime_cost_estimate === null ? null : Number(job.runtime_cost_estimate),
    balanceBefore: job.balance_before === null ? null : Number(job.balance_before),
    leaseExpiresAt: job.lease_expires_at,
    outputUrl: job.output_url,
    outputContentType: job.output_content_type,
    error: job.error_message,
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

export const cleanupExpiredVastJobs = async () => {
  const expired = await listExpiredGpuJobs(20);
  let destroyed = 0;
  let failed = 0;

  for (const job of expired) {
    if (!job.instance_id) continue;

    try {
      await destroyVastInstance(job.instance_id);
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

export const startVastGpuJob = async ({
  userId,
  input,
  appBaseUrl,
}: {
  userId: string;
  input: GpuJobInput;
  appBaseUrl: string;
}) => {
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const profile = getGpuProfile(input.workload);
  const policy = getGpuBudgetPolicy();

  if (!profile.workerImage) {
    throw new Error(
      'La máquina para ' + input.workload +
      ' está preparada, pero falta configurar su imagen worker en Vercel. Nayla no rentará una GPU hasta tener un worker válido.'
    );
  }

  await cleanupExpiredVastJobs().catch((error) => {
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

  const offer = offers[0];
  if (!offer) {
    throw new Error(
      'No encontré una GPU verificada dentro del tope de $' +
      profile.maxHourlyUsd.toFixed(2) + '/h para ' + input.workload + '.'
    );
  }

  const hourlyPrice = Number(offer.dph_total);
  const estimatedMaxCost = estimatedWorstCaseCost(
    hourlyPrice,
    profile.maxRuntimeMinutes + policy.bootGraceMinutes,
    policy.safetyMultiplier
  );

  if (estimatedMaxCost > policy.maxJobUsd) {
    throw new Error(
      'La GPU más barata excede el límite por trabajo ($' +
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
      },
      profile: {
        minGpuRamGb: profile.minGpuRamGb,
        diskGb: profile.diskGb,
        maxHourlyUsd: profile.maxHourlyUsd,
        maxRuntimeMinutes: profile.maxRuntimeMinutes,
      },
    },
  });

  const outputKey =
    profile.outputExtension
      ? userId + '/gpu/' + job.id + '.' + profile.outputExtension
      : null;

  const outputUrl =
    outputKey && profile.outputContentType
      ? createR2PresignedPutUrl({
          key: outputKey,
          contentType: profile.outputContentType,
          expiresIn: 3600,
        }).url
      : null;

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
      image: profile.workerImage,
      diskGb: profile.diskGb,
      label,
      onstart: input.workload === 'probe' ? buildProbeOnstart() : buildWorkerOnstart(),
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
          publicUrl: outputUpload.url,
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

  if (['completed', 'failed', 'expired'].includes(job.status)) {
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
      const { count, error: countError } = await supabase
        .from('galeria_multimedia')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', job.user_id)
        .eq('tipo', galleryType);
      if (countError) throw countError;

      const galleryItem = {
        id: randomUUID(),
        user_id: job.user_id,
        url: job.output_url,
        tipo: galleryType,
        nombre:
          'Nayla GPU ' + workload + ' ' + job.id.slice(0, 8) + '.' +
          (getGpuProfile(workload).outputExtension || 'bin'),
        creado_en: now.toISOString(),
        esOverlay: false,
        etiqueta: prefix + ((count || 0) + 1),
        fuente: 'gpu:vast',
        metadata: {
          sourceProvider: 'vast',
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

  if (job.instance_id) {
    try {
      await destroyVastInstance(job.instance_id);
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
  if (!job.instance_id || terminal.includes(job.status)) {
    return publicJob(job);
  }

  try {
    const instance = await getVastInstance(job.instance_id);
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
        error_message: 'Vast.ai dejó de reportar la instancia antes de completar el trabajo.',
        completed_at: now.toISOString(),
        destroyed_at: now.toISOString(),
        runtime_cost_estimate: computeRuntimeCost(job, now),
      });
      return publicJob(job);
    }

    const actualStatus =
      typeof instance.actual_status === 'string' ? instance.actual_status : 'unknown';
    const intendedStatus =
      typeof instance.intended_status === 'string' ? instance.intended_status : 'unknown';
    const statusMessage =
      typeof instance.status_msg === 'string' ? instance.status_msg.trim().slice(0, 1000) : '';

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
      const instanceId = job.instance_id;
      if (!instanceId) {
        job = await updateGpuJob(job.id, {
          status: 'failed',
          error_message: statusMessage || 'La instancia Vast desapareció durante el arranque.',
          completed_at: now.toISOString(),
          destroyed_at: now.toISOString(),
          runtime_cost_estimate: computeRuntimeCost(job, now),
          metadata: runtimeMetadata,
        });
        return publicJob(job);
      }

      let destroyedAt: string | null = null;
      try {
        await destroyVastInstance(instanceId);
        destroyedAt = new Date().toISOString();
      } catch (destroyError) {
        console.error('[gpu] No se pudo destruir la instancia tras fallo de arranque:', destroyError);
      }

      job = await updateGpuJob(job.id, {
        status: destroyedAt ? 'failed' : 'cleanup_pending',
        error_message:
          statusMessage ||
          'La instancia Vast no alcanzó un estado ejecutable y Nayla activó la limpieza.',
        completed_at: now.toISOString(),
        destroyed_at: destroyedAt,
        runtime_cost_estimate: computeRuntimeCost(job, now),
        lease_expires_at: destroyedAt ? job.lease_expires_at : new Date(Date.now() - 1000).toISOString(),
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
    console.warn('[gpu] No se pudo reconciliar el estado de Vast:', error);
  }

  return publicJob(job);
};

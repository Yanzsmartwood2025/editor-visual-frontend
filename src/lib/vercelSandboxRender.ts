import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { uploadR2Object } from './r2';
import { VERCEL_SANDBOX_CHROMIUM_OPTIONS } from './remotionSandboxOptions';
import { buildNaylaAudioMasterFilter, type NaylaAudioMasterSettings } from './naylaAudioMaster';

const COMPOSITION_ID = 'MainComposition';
const BUNDLE_DIR = path.join(process.cwd(), '.remotion');

const inputPropsToRecord = (inputProps: unknown): Record<string, unknown> => {
  if (typeof inputProps !== 'object' || inputProps === null || Array.isArray(inputProps)) {
    throw new Error('inputProps debe ser un objeto para renderizar la composición.');
  }

  return inputProps as Record<string, unknown>;
};



/**
 * Uses the Remotion bundle generated during the Vercel build, renders it in an
 * isolated Vercel Sandbox, then copies the resulting media file to Cloudflare R2.
 *
 * Bundling at runtime is intentionally avoided: @remotion/bundler depends on
 * native Rspack bindings which should not be loaded by the deployed API function.
 */
export type NaylaRenderProgress = {
  stage: 'preparing' | 'rendering' | 'saving' | 'completed';
  phase: string;
  progress: number;
};

export async function startVercelSandboxRender(
  inputProps: unknown,
  scope: { ownerId: string; projectId: string; threadId?: string },
  onProgress?: (update: NaylaRenderProgress) => Promise<void> | void,
  shouldCancel?: () => Promise<boolean> | boolean
) {
  const props = inputPropsToRecord(inputProps);
  const { addBundleToSandbox, createSandbox, renderMediaOnVercel } = await import('@remotion/vercel').catch(() => {
    throw new Error('El adaptador @remotion/vercel no está instalado en este entorno. Instálalo durante el despliegue de Vercel Sandbox.');
  });

  const ensureNotCancelled = async () => {
    if (!shouldCancel) return;
    if (await shouldCancel()) {
      throw new Error('NAYLA_RENDER_CANCELLED');
    }
  };

  const emitProgress = async (update: NaylaRenderProgress) => {
    await ensureNotCancelled();
    if (!onProgress) return;
    await onProgress({
      ...update,
      progress: Math.max(0, Math.min(1, Number(update.progress) || 0)),
    });
  };

  const startedAt = Date.now();
  const bundleStartedAt = Date.now();
  const bundleDir = BUNDLE_DIR;
  const bundleMs = Date.now() - bundleStartedAt;

  await emitProgress({ stage: 'preparing', phase: 'Preparando edición', progress: 0.03 });

  const sandboxStartedAt = Date.now();
  const sandbox = await createSandbox({
    resources: { vcpus: 4 },
    timeoutInMilliseconds: 5 * 60 * 1000,
  });
  const sandboxCreateMs = Date.now() - sandboxStartedAt;

  await ensureNotCancelled();
  await emitProgress({ stage: 'preparing', phase: 'Preparando motor de edición', progress: 0.08 });

  let lastProgress = 0;
  const renderStartedAt = Date.now();

  try {
    // @remotion/vercel creates nested bundle directories but expects the root
    // directory to exist first inside a fresh Vercel Sandbox.
    await ensureNotCancelled();
    await sandbox.mkDir('remotion-bundle');
    await addBundleToSandbox({ sandbox, bundleDir });
    await ensureNotCancelled();
    await emitProgress({ stage: 'preparing', phase: 'Organizando medios', progress: 0.12 });

    const { sandboxFilePath, contentType } = await renderMediaOnVercel({
      sandbox,
      compositionId: COMPOSITION_ID,
      inputProps: props,
      codec: 'h264',
      outputFile: '/tmp/render.mp4',
      concurrency: 4,
      chromiumOptions: VERCEL_SANDBOX_CHROMIUM_OPTIONS,
      timeoutInMilliseconds: 60_000,
      detachedSandboxTimeoutInMilliseconds: 5 * 60 * 1000,
      onProgress: async (update: any) => {
        await ensureNotCancelled();
        const overall = Number(update?.overallProgress ?? update?.progress?.progress ?? 0);
        if (Number.isFinite(overall)) lastProgress = Math.max(lastProgress, overall);

        const stage = String(update?.stage || '');
        const phase =
          stage === 'opening-browser'
            ? 'Preparando render'
            : stage === 'selecting-composition'
              ? 'Organizando fotogramas'
              : stage === 'render-progress'
                ? 'Procesando fotogramas'
                : 'Procesando video';

        await emitProgress({
          stage: stage === 'render-progress' ? 'rendering' : 'preparing',
          phase,
          progress: Math.max(0.12, Math.min(0.9, Number.isFinite(overall) ? overall : lastProgress)),
        });
      },
    });
    const renderMs = Date.now() - renderStartedAt;
    await ensureNotCancelled();
    await emitProgress({ stage: 'saving', phase: 'Preparando archivo final', progress: 0.93 });

    const readStartedAt = Date.now();
    const file = await sandbox.readFileToBuffer({ path: sandboxFilePath });
    const readMs = Date.now() - readStartedAt;
    if (!file) {
      throw new Error(`Vercel Sandbox no produjo el archivo de render: ${sandboxFilePath}`);
    }

    await ensureNotCancelled();
    const threadSegment = scope.threadId ? `threads/${scope.threadId}` : 'shared';
    const key =
      `${scope.ownerId}/projects/${scope.projectId}/${threadSegment}/renders/` +
      `${randomUUID()}.mp4`;
    await emitProgress({ stage: 'saving', phase: 'Guardando resultado', progress: 0.97 });

    const uploadStartedAt = Date.now();
    const stored = await uploadR2Object(key, new Uint8Array(file), contentType);
    const uploadMs = Date.now() - uploadStartedAt;
    await emitProgress({ stage: 'completed', phase: 'Resultado listo', progress: 1 });
    const totalMs = Date.now() - startedAt;

    return {
      status: 'completed' as const,
      engine: 'remotion-cpu-sandbox' as const,
      usage: {
        vcpus: 4,
        bundleMs,
        sandboxCreateMs,
        renderMs,
        readMs,
        uploadMs,
        totalMs,
        sandboxWallSeconds: Math.ceil((sandboxCreateMs + renderMs + readMs) / 1000),
        lastProgress,
        outputBytes: file.byteLength,
      },
      output: {
        key: stored.key,
        r2Key: stored.key,
        storageUrl: stored.privateUrl,
        url: stored.readUrl,
        privacy: 'private' as const,
      },
      contentType,
    };
  } finally {
    await sandbox[Symbol.asyncDispose]();
  }
}


const DETACHED_SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
const DETACHED_OUTPUT_FILE = '/tmp/nayla-render.mp4';
const DETACHED_LOG_FILE = '/tmp/nayla-render.log';
const DETACHED_PROGRESS_FILE = '/tmp/nayla-render-progress.json';
const DETACHED_EXIT_FILE = '/tmp/nayla-render.exit.json';
const DETACHED_CONFIG_FILE = '/tmp/nayla-render-config.json';
const DETACHED_RUNNER_FILE = '/tmp/nayla-render-runner.sh';
const DETACHED_AUDIO_FILTER_FILE = '/tmp/nayla-audio-master-filter.txt';
const DETACHED_MASTERED_OUTPUT_FILE = '/tmp/nayla-render-mastered.mp4';
const DETACHED_METRICS_FILE = '/tmp/nayla-render-metrics.json';
const DETACHED_REMOTION_PROGRESS_FILE = '/tmp/nayla-remotion-progress.json';

export type NaylaDetachedRenderStart = {
  status: 'started';
  engine: 'remotion-cpu-sandbox-detached';
  sandboxId: string;
  cmdId: string;
  outputFile: string;
  logFile: string;
  exitFile: string;
  metricsFile: string;
  sandboxPreparationMs: number;
};

export type NaylaDetachedRenderTimings = {
  sandboxPreparationMs?: number;
  renderMs?: number;
  audioMasterMs?: number;
  uploadMs?: number;
  processMs?: number;
  audioMasterApplied?: boolean;
};

export type NaylaRemotionProgressMetrics = {
  renderedFrames?: number;
  encodedFrames?: number;
  renderedDoneInMs?: number;
  encodedDoneInMs?: number;
  renderEstimatedTimeMs?: number;
  stitchStage?: string;
  progress?: number;
};

export type NaylaSandboxUsageMetrics = {
  activeCpuUsageMs?: number;
  totalDurationMs?: number;
  totalActiveCpuDurationMs?: number;
  totalIngressBytes?: number;
  totalEgressBytes?: number;
  averageActiveVcpus?: number;
};

export type NaylaDetachedRenderPoll = {
  state: 'running' | 'completed' | 'failed';
  stage: 'preparing' | 'rendering' | 'saving' | 'completed';
  phase: string;
  progress: number;
  error?: string;
  timings?: NaylaDetachedRenderTimings;
  remotionMetrics?: NaylaRemotionProgressMetrics;
};

const readSandboxTextIfExists = async (sandbox: any, filePath: string) => {
  try {
    const value = await sandbox.readFileToBuffer({ path: filePath });
    return value ? value.toString('utf8') : '';
  } catch {
    return '';
  }
};

export const parseNaylaDetachedRenderTimings = (raw: string): NaylaDetachedRenderTimings | undefined => {
  if (!raw.trim()) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const numeric = (key: string) => {
      const value = Number(parsed[key]);
      return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
    };
    return {
      renderMs: numeric('renderMs'),
      audioMasterMs: numeric('audioMasterMs'),
      uploadMs: numeric('uploadMs'),
      processMs: numeric('processMs'),
      audioMasterApplied: parsed.audioMasterApplied === true,
    };
  } catch {
    return undefined;
  }
};

export const parseNaylaRemotionProgressMetrics = (raw: string): NaylaRemotionProgressMetrics | undefined => {
  if (!raw.trim()) return undefined;

  try {
    const message = JSON.parse(raw) as Record<string, unknown>;
    if (message.stage !== 'render-progress' || !message.progress || typeof message.progress !== 'object') {
      return undefined;
    }
    const progress = message.progress as Record<string, unknown>;
    const numeric = (key: string) => {
      const value = Number(progress[key]);
      return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
    };
    const normalizedProgress = Number(progress.progress);
    return {
      renderedFrames: numeric('renderedFrames'),
      encodedFrames: numeric('encodedFrames'),
      renderedDoneInMs: numeric('renderedDoneIn'),
      encodedDoneInMs: numeric('encodedDoneIn'),
      renderEstimatedTimeMs: numeric('renderEstimatedTime'),
      stitchStage: typeof progress.stitchStage === 'string' ? progress.stitchStage : undefined,
      progress: Number.isFinite(normalizedProgress)
        ? Math.max(0, Math.min(1, normalizedProgress))
        : undefined,
    };
  } catch {
    return undefined;
  }
};

const parseDetachedProgress = (rawLog: string): NaylaDetachedRenderPoll => {
  let result: NaylaDetachedRenderPoll = {
    state: 'running',
    stage: 'preparing',
    phase: 'Preparando render',
    progress: 0.12,
  };

  for (const rawLine of rawLog.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      const naylaStage = String(message.naylaStage || '');
      if (naylaStage === 'mastering-audio') {
        result = {
          state: 'running',
          stage: 'saving',
          phase: 'Procesando y masterizando audio',
          progress: Math.max(result.progress, 0.93),
        };
        continue;
      }
      if (naylaStage === 'uploading') {
        result = {
          state: 'running',
          stage: 'saving',
          phase: 'Guardando resultado',
          progress: Math.max(result.progress, 0.96),
        };
        continue;
      }
      if (naylaStage === 'uploaded') {
        result = {
          state: 'running',
          stage: 'saving',
          phase: 'Confirmando archivo final',
          progress: Math.max(result.progress, 0.995),
        };
        continue;
      }

      const stage = String(message.stage || '');
      if (stage === 'opening-browser') {
        result = {
          state: 'running',
          stage: 'preparing',
          phase: 'Preparando motor de edición',
          progress: Math.max(result.progress, 0.13),
        };
        continue;
      }
      if (stage === 'selecting-composition') {
        result = {
          state: 'running',
          stage: 'preparing',
          phase: 'Organizando fotogramas',
          progress: Math.max(result.progress, 0.15),
        };
        continue;
      }
      if (stage === 'render-progress') {
        const rawProgress = Number(
          message.overallProgress ??
          (message.progress && typeof message.progress === 'object'
            ? (message.progress as Record<string, unknown>).progress
            : 0)
        );
        const normalized = Number.isFinite(rawProgress)
          ? Math.max(0, Math.min(1, rawProgress))
          : 0;
        result = {
          state: 'running',
          stage: 'rendering',
          phase: 'Procesando fotogramas',
          progress: Math.max(result.progress, 0.15 + normalized * 0.77),
        };
      }
    } catch {
      // Remotion can emit non-JSON diagnostic lines; ignore them for progress.
    }
  }

  return result;
};

export async function startVercelSandboxRenderDetached(
  inputProps: unknown,
  uploadUrl: string
): Promise<NaylaDetachedRenderStart> {
  const props = inputPropsToRecord(inputProps);
  const rawSettings = props.settings && typeof props.settings === 'object' && !Array.isArray(props.settings)
    ? props.settings as Record<string, unknown>
    : {};
  const audioMasterFilter = buildNaylaAudioMasterFilter(
    rawSettings.audioMaster as NaylaAudioMasterSettings | undefined
  );
  const { addBundleToSandbox, createSandbox } = await import('@remotion/vercel').catch(() => {
    throw new Error('El adaptador de render no está disponible en este entorno.');
  });

  const preparationStartedAt = Date.now();
  const sandbox = await createSandbox({
    resources: { vcpus: 4 },
    timeoutInMilliseconds: DETACHED_SANDBOX_TIMEOUT_MS,
  });

  try {
    await sandbox.mkDir('remotion-bundle');
    await addBundleToSandbox({ sandbox, bundleDir: BUNDLE_DIR });

    const renderConfig = {
      serveUrl: '/vercel/sandbox/remotion-bundle',
      compositionId: COMPOSITION_ID,
      inputProps: props,
      outputLocation: DETACHED_OUTPUT_FILE,
      codec: 'h264',
      crf: null,
      imageFormat: null,
      pixelFormat: null,
      envVariables: {},
      frameRange: null,
      everyNthFrame: 1,
      proResProfile: null,
      chromiumOptions: VERCEL_SANDBOX_CHROMIUM_OPTIONS,
      scale: 1,
      preferLossless: false,
      enforceAudioTrack: false,
      disallowParallelEncoding: false,
      concurrency: 4,
      metadata: null,
      licenseKey: null,
      videoBitrate: null,
      audioBitrate: null,
      encodingMaxRate: null,
      encodingBufferSize: null,
      muted: false,
      numberOfGifLoops: null,
      x264Preset: null,
      gopSize: null,
      colorSpace: 'default',
      jpegQuality: 80,
      audioCodec: null,
      logLevel: 'info',
      timeoutInMilliseconds: 60_000,
      forSeamlessAacConcatenation: false,
      separateAudioTo: null,
      hardwareAcceleration: 'disable',
      offthreadVideoCacheSizeInBytes: null,
      mediaCacheSizeInBytes: null,
      offthreadVideoThreads: null,
      chromeMode: 'headless-shell',
      browserExecutable: null,
      binariesDirectory: null,
      repro: false,
      sampleRate: 48_000,
      vercelBlob: null,
    };

    const runner = `#!/usr/bin/env bash
set +e
: > "${DETACHED_LOG_FILE}"
rm -f "${DETACHED_EXIT_FILE}" "${DETACHED_METRICS_FILE}" "${DETACHED_REMOTION_PROGRESS_FILE}"
printf '{"stage":"opening-browser"}\\n' > "${DETACHED_PROGRESS_FILE}"

runner_started_ms="$(date +%s%3N)"
render_started_ms="$runner_started_ms"
render_ms=0
audio_master_ms=0
upload_ms=0
audio_master_applied=false

write_nayla_metrics() {
  now_ms="$(date +%s%3N)"
  process_ms=$((now_ms - runner_started_ms))
  printf '{"renderMs":%s,"audioMasterMs":%s,"uploadMs":%s,"processMs":%s,"audioMasterApplied":%s}\\n' \
    "$render_ms" "$audio_master_ms" "$upload_ms" "$process_ms" "$audio_master_applied" > "${DETACHED_METRICS_FILE}"
}

node render-video.mjs "$(cat "${DETACHED_CONFIG_FILE}")" 2>&1 | while IFS= read -r line; do
  printf '%s\\n' "$line" >> "${DETACHED_LOG_FILE}"
  case "$line" in
    *'"stage"'*'render-progress'*)
      printf '%s\\n' "$line" > "${DETACHED_PROGRESS_FILE}"
      printf '%s\\n' "$line" > "${DETACHED_REMOTION_PROGRESS_FILE}"
      ;;
    *'"stage"'*'opening-browser'*|*'"stage"'*'selecting-composition'*)
      printf '%s\\n' "$line" > "${DETACHED_PROGRESS_FILE}"
      ;;
  esac
done
render_status=\${PIPESTATUS[0]}
render_finished_ms="$(date +%s%3N)"
render_ms=$((render_finished_ms - render_started_ms))
write_nayla_metrics
if [ "$render_status" -ne 0 ]; then
  printf '{"phase":"render","exitCode":%s}\\n' "$render_status" > "${DETACHED_EXIT_FILE}"
  exit "$render_status"
fi

if [ -s "${DETACHED_AUDIO_FILTER_FILE}" ]; then
  audio_master_applied=true
  audio_started_ms="$(date +%s%3N)"
  printf '{"naylaStage":"mastering-audio"}\\n' >> "${DETACHED_LOG_FILE}"
  printf '{"naylaStage":"mastering-audio"}\\n' > "${DETACHED_PROGRESS_FILE}"
  audio_filter="$(cat "${DETACHED_AUDIO_FILTER_FILE}")"

  run_nayla_ffmpeg() {
    if command -v ffmpeg >/dev/null 2>&1; then
      ffmpeg "$@"
      return $?
    fi
    if [ -x "./node_modules/.bin/remotion" ]; then
      "./node_modules/.bin/remotion" ffmpeg "$@"
      return $?
    fi
    npx --yes @remotion/cli@4.0.526 ffmpeg "$@"
  }

  rm -f "${DETACHED_MASTERED_OUTPUT_FILE}"
  run_nayla_ffmpeg \
    -y \
    -i "${DETACHED_OUTPUT_FILE}" \
    -map "0:v:0?" \
    -map "0:a:0?" \
    -c:v copy \
    -af "$audio_filter" \
    -c:a aac \
    -b:a 192k \
    -movflags +faststart \
    "${DETACHED_MASTERED_OUTPUT_FILE}" >> "${DETACHED_LOG_FILE}" 2>&1
  audio_status=$?
  audio_finished_ms="$(date +%s%3N)"
  audio_master_ms=$((audio_finished_ms - audio_started_ms))
  write_nayla_metrics
  if [ "$audio_status" -ne 0 ]; then
    printf '{"phase":"audio-master","exitCode":%s}\\n' "$audio_status" > "${DETACHED_EXIT_FILE}"
    exit "$audio_status"
  fi
  mv "${DETACHED_MASTERED_OUTPUT_FILE}" "${DETACHED_OUTPUT_FILE}"
fi

printf '{"naylaStage":"uploading"}\\n' >> "${DETACHED_LOG_FILE}"
printf '{"naylaStage":"uploading"}\\n' > "${DETACHED_PROGRESS_FILE}"
upload_started_ms="$(date +%s%3N)"
curl --fail --silent --show-error --retry 3 --retry-delay 2 \
  --request PUT \
  --header "Content-Type: video/mp4" \
  --upload-file "${DETACHED_OUTPUT_FILE}" \
  "$R2_UPLOAD_URL" >> "${DETACHED_LOG_FILE}" 2>&1
upload_status=$?
upload_finished_ms="$(date +%s%3N)"
upload_ms=$((upload_finished_ms - upload_started_ms))
write_nayla_metrics
if [ "$upload_status" -ne 0 ]; then
  printf '{"phase":"upload","exitCode":%s}\\n' "$upload_status" > "${DETACHED_EXIT_FILE}"
  exit "$upload_status"
fi
printf '{"naylaStage":"uploaded"}\\n' >> "${DETACHED_LOG_FILE}"
printf '{"naylaStage":"uploaded"}\\n' > "${DETACHED_PROGRESS_FILE}"
printf '{"phase":"completed","exitCode":0}\\n' > "${DETACHED_EXIT_FILE}"
exit 0
`;
    await sandbox.writeFiles([
      {
        path: DETACHED_CONFIG_FILE,
        content: Buffer.from(JSON.stringify(renderConfig)),
      },
      {
        path: DETACHED_RUNNER_FILE,
        content: Buffer.from(runner),
      },
      {
        path: DETACHED_AUDIO_FILTER_FILE,
        content: Buffer.from(audioMasterFilter || ''),
      },
    ]);

    const sandboxPreparationMs = Date.now() - preparationStartedAt;
    const command = await sandbox.runCommand({
      cmd: 'bash',
      args: [DETACHED_RUNNER_FILE],
      detached: true,
      env: {
        R2_UPLOAD_URL: uploadUrl,
      },
    });

    return {
      status: 'started',
      engine: 'remotion-cpu-sandbox-detached',
      sandboxId: sandbox.sandboxId,
      cmdId: command.cmdId,
      outputFile: DETACHED_OUTPUT_FILE,
      logFile: DETACHED_LOG_FILE,
      exitFile: DETACHED_EXIT_FILE,
      metricsFile: DETACHED_METRICS_FILE,
      sandboxPreparationMs,
    };
  } catch (error) {
    try {
      await sandbox[Symbol.asyncDispose]();
    } catch {
      // Ignore cleanup failures while preserving the original render error.
    }
    throw error;
  }
}

export async function pollVercelSandboxRenderDetached({
  sandboxId,
  logFile = DETACHED_LOG_FILE,
  exitFile = DETACHED_EXIT_FILE,
  metricsFile = DETACHED_METRICS_FILE,
}: {
  sandboxId: string;
  logFile?: string;
  exitFile?: string;
  metricsFile?: string;
}): Promise<NaylaDetachedRenderPoll> {
  const { Sandbox } = await import('@vercel/sandbox');
  const sandbox = await Sandbox.get({ sandboxId });

  const [rawProgress, rawExit, rawMetrics, rawRemotionProgress] = await Promise.all([
    readSandboxTextIfExists(sandbox, DETACHED_PROGRESS_FILE),
    readSandboxTextIfExists(sandbox, exitFile),
    readSandboxTextIfExists(sandbox, metricsFile),
    readSandboxTextIfExists(sandbox, DETACHED_REMOTION_PROGRESS_FILE),
  ]);
  const timings = parseNaylaDetachedRenderTimings(rawMetrics);
  const remotionMetrics = parseNaylaRemotionProgressMetrics(rawRemotionProgress);

  let legacyRawLog = '';
  let progressSource = rawProgress;
  if (!progressSource.trim()) {
    // Sandboxes started before the lightweight progress file existed still
    // expose progress only through the render log. New renders never take
    // this path, so normal polling stays cheap.
    legacyRawLog = await readSandboxTextIfExists(sandbox, logFile);
    progressSource = legacyRawLog;
  }

  const progress = progressSource.trim()
    ? parseDetachedProgress(progressSource)
    : {
        state: 'running' as const,
        stage: 'preparing' as const,
        phase: 'Preparando render',
        progress: 0.12,
      };

  if (!rawExit.trim()) return { ...progress, timings, remotionMetrics };

  try {
    const exit = JSON.parse(rawExit) as { phase?: string; exitCode?: number };
    const exitCode = Number(exit.exitCode);
    if (exitCode === 0) {
      return {
        state: 'completed',
        stage: 'completed',
        phase: 'Resultado listo',
        progress: 1,
        timings,
        remotionMetrics,
      };
    }

    const rawLog = legacyRawLog || await readSandboxTextIfExists(sandbox, logFile);
    const tail = rawLog.slice(-4000).replace(/\s+/g, ' ').trim();
    return {
      state: 'failed',
      stage: progress.stage,
      phase: exit.phase === 'upload' ? 'No se pudo guardar el resultado' : exit.phase === 'audio-master' ? 'No se pudo masterizar el audio' : 'El render se interrumpió',
      progress: progress.progress,
      error: tail || (exit.phase === 'audio-master' ? 'No se pudo procesar el audio final.' : `El proceso terminó con código ${exitCode}.`),
      timings,
      remotionMetrics,
    };
  } catch {
    return {
      state: 'failed',
      stage: progress.stage,
      phase: 'El render se interrumpió',
      progress: progress.progress,
      error: 'El resultado del proceso no pudo verificarse.',
      timings,
      remotionMetrics,
    };
  }
}

export async function stopVercelSandboxRender(sandboxId: string): Promise<NaylaSandboxUsageMetrics | undefined> {
  if (!sandboxId) return undefined;
  try {
    const { Sandbox } = await import('@vercel/sandbox');
    const sandbox = await Sandbox.get({ sandboxId });
    const stop = (sandbox as any).stop;
    if (typeof stop === 'function') {
      await stop.call(sandbox);
    } else {
      const dispose = (sandbox as any)[Symbol.asyncDispose];
      if (typeof dispose === 'function') {
        await dispose.call(sandbox);
      }
    }

    const numeric = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
    };
    const activeCpuUsageMs = numeric((sandbox as any).activeCpuUsageMs);
    const totalDurationMs = numeric((sandbox as any).totalDurationMs);
    const totalActiveCpuDurationMs = numeric((sandbox as any).totalActiveCpuDurationMs);
    const totalIngressBytes = numeric((sandbox as any).totalIngressBytes);
    const totalEgressBytes = numeric((sandbox as any).totalEgressBytes);
    const cpuDurationMs = activeCpuUsageMs ?? totalActiveCpuDurationMs;
    const averageActiveVcpus = cpuDurationMs !== undefined && totalDurationMs && totalDurationMs > 0
      ? Math.round((cpuDurationMs / totalDurationMs) * 100) / 100
      : undefined;

    return {
      activeCpuUsageMs,
      totalDurationMs,
      totalActiveCpuDurationMs,
      totalIngressBytes,
      totalEgressBytes,
      averageActiveVcpus,
    };
  } catch {
    // The sandbox may already have stopped or expired.
    return undefined;
  }
}

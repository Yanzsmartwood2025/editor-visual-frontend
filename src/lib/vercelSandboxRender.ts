import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { uploadR2Object } from './r2';
import { VERCEL_SANDBOX_CHROMIUM_OPTIONS } from './remotionSandboxOptions';

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
const DETACHED_EXIT_FILE = '/tmp/nayla-render.exit.json';
const DETACHED_CONFIG_FILE = '/tmp/nayla-render-config.json';
const DETACHED_RUNNER_FILE = '/tmp/nayla-render-runner.sh';

export type NaylaDetachedRenderStart = {
  status: 'started';
  engine: 'remotion-cpu-sandbox-detached';
  sandboxId: string;
  cmdId: string;
  outputFile: string;
  logFile: string;
  exitFile: string;
};

export type NaylaDetachedRenderPoll = {
  state: 'running' | 'completed' | 'failed';
  stage: 'preparing' | 'rendering' | 'saving' | 'completed';
  phase: string;
  progress: number;
  error?: string;
};

const readSandboxTextIfExists = async (sandbox: any, filePath: string) => {
  try {
    const value = await sandbox.readFileToBuffer({ path: filePath });
    return value ? value.toString('utf8') : '';
  } catch {
    return '';
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
      if (naylaStage === 'uploading') {
        result = {
          state: 'running',
          stage: 'saving',
          phase: 'Guardando resultado',
          progress: Math.max(result.progress, 0.94),
        };
        continue;
      }
      if (naylaStage === 'uploaded') {
        result = {
          state: 'running',
          stage: 'saving',
          phase: 'Confirmando archivo final',
          progress: Math.max(result.progress, 0.99),
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
  const { addBundleToSandbox, createSandbox } = await import('@remotion/vercel').catch(() => {
    throw new Error('El adaptador de render no está disponible en este entorno.');
  });

  const sandbox = await createSandbox({
    resources: { vcpus: 4 },
    timeoutInMilliseconds: DETACHED_SANDBOX_TIMEOUT_MS,
  });

  try {
    await sandbox.extendTimeout(DETACHED_SANDBOX_TIMEOUT_MS);
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
rm -f "${DETACHED_EXIT_FILE}"
node render-video.mjs "$(cat "${DETACHED_CONFIG_FILE}")" >> "${DETACHED_LOG_FILE}" 2>&1
render_status=$?
if [ "$render_status" -ne 0 ]; then
  printf '{"phase":"render","exitCode":%s}\n' "$render_status" > "${DETACHED_EXIT_FILE}"
  exit "$render_status"
fi
printf '{"naylaStage":"uploading"}\n' >> "${DETACHED_LOG_FILE}"
curl --fail --silent --show-error --retry 3 --retry-delay 2 \
  --request PUT \
  --header "Content-Type: video/mp4" \
  --upload-file "${DETACHED_OUTPUT_FILE}" \
  "$R2_UPLOAD_URL" >> "${DETACHED_LOG_FILE}" 2>&1
upload_status=$?
if [ "$upload_status" -ne 0 ]; then
  printf '{"phase":"upload","exitCode":%s}\n' "$upload_status" > "${DETACHED_EXIT_FILE}"
  exit "$upload_status"
fi
printf '{"naylaStage":"uploaded"}\n' >> "${DETACHED_LOG_FILE}"
printf '{"phase":"completed","exitCode":0}\n' > "${DETACHED_EXIT_FILE}"
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
        mode: 0o755,
      },
    ]);

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
    };
  } catch (error) {
    await sandbox[Symbol.asyncDispose]().catch(() => undefined);
    throw error;
  }
}

export async function pollVercelSandboxRenderDetached({
  sandboxId,
  logFile = DETACHED_LOG_FILE,
  exitFile = DETACHED_EXIT_FILE,
}: {
  sandboxId: string;
  logFile?: string;
  exitFile?: string;
}): Promise<NaylaDetachedRenderPoll> {
  const { Sandbox } = await import('@vercel/sandbox');
  const sandbox = await Sandbox.get({ sandboxId });

  const [rawLog, rawExit] = await Promise.all([
    readSandboxTextIfExists(sandbox, logFile),
    readSandboxTextIfExists(sandbox, exitFile),
  ]);

  const progress = parseDetachedProgress(rawLog);
  if (!rawExit.trim()) return progress;

  try {
    const exit = JSON.parse(rawExit) as { phase?: string; exitCode?: number };
    const exitCode = Number(exit.exitCode);
    if (exitCode === 0) {
      return {
        state: 'completed',
        stage: 'completed',
        phase: 'Resultado listo',
        progress: 1,
      };
    }

    const tail = rawLog.slice(-4000).replace(/\s+/g, ' ').trim();
    return {
      state: 'failed',
      stage: progress.stage,
      phase: exit.phase === 'upload' ? 'No se pudo guardar el resultado' : 'El render se interrumpió',
      progress: progress.progress,
      error: tail || `El proceso terminó con código ${exitCode}.`,
    };
  } catch {
    return {
      state: 'failed',
      stage: progress.stage,
      phase: 'El render se interrumpió',
      progress: progress.progress,
      error: 'El resultado del proceso no pudo verificarse.',
    };
  }
}

export async function stopVercelSandboxRender(sandboxId: string) {
  if (!sandboxId) return;
  try {
    const { Sandbox } = await import('@vercel/sandbox');
    const sandbox = await Sandbox.get({ sandboxId });
    const stop = (sandbox as any).stop;
    if (typeof stop === 'function') {
      await stop.call(sandbox);
      return;
    }
    const dispose = (sandbox as any)[Symbol.asyncDispose];
    if (typeof dispose === 'function') {
      await dispose.call(sandbox);
    }
  } catch {
    // The sandbox may already have stopped or expired.
  }
}

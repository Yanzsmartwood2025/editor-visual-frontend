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

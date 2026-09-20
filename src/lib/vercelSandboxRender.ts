import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { uploadR2Object } from './r2';

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
export async function startVercelSandboxRender(
  inputProps: unknown,
  scope: { ownerId: string; projectId: string; threadId?: string }
) {
  const props = inputPropsToRecord(inputProps);
  const { addBundleToSandbox, createSandbox, renderMediaOnVercel } = await import('@remotion/vercel').catch(() => {
    throw new Error('El adaptador @remotion/vercel no está instalado en este entorno. Instálalo durante el despliegue de Vercel Sandbox.');
  });

  const startedAt = Date.now();
  const bundleStartedAt = Date.now();
  const bundleDir = BUNDLE_DIR;
  const bundleMs = Date.now() - bundleStartedAt;

  const sandboxStartedAt = Date.now();
  const sandbox = await createSandbox({
    resources: { vcpus: 4 },
    timeoutInMilliseconds: 5 * 60 * 1000,
  });
  const sandboxCreateMs = Date.now() - sandboxStartedAt;

  let lastProgress = 0;
  const renderStartedAt = Date.now();

  try {
    await addBundleToSandbox({ sandbox, bundleDir });

    const { sandboxFilePath, contentType } = await renderMediaOnVercel({
      sandbox,
      compositionId: COMPOSITION_ID,
      inputProps: props,
      codec: 'h264',
      outputFile: '/tmp/render.mp4',
      concurrency: 4,
      timeoutInMilliseconds: 60_000,
      detachedSandboxTimeoutInMilliseconds: 5 * 60 * 1000,
      onProgress: async (update: any) => {
        const overall = Number(update?.overallProgress ?? update?.progress?.progress ?? 0);
        if (Number.isFinite(overall)) lastProgress = Math.max(lastProgress, overall);
      },
    });
    const renderMs = Date.now() - renderStartedAt;

    const readStartedAt = Date.now();
    const file = await sandbox.readFileToBuffer({ path: sandboxFilePath });
    const readMs = Date.now() - readStartedAt;
    if (!file) {
      throw new Error(`Vercel Sandbox no produjo el archivo de render: ${sandboxFilePath}`);
    }

    const threadSegment = scope.threadId ? `threads/${scope.threadId}` : 'shared';
    const key =
      `${scope.ownerId}/projects/${scope.projectId}/${threadSegment}/renders/` +
      `${randomUUID()}.mp4`;
    const uploadStartedAt = Date.now();
    const stored = await uploadR2Object(key, new Uint8Array(file), contentType);
    const uploadMs = Date.now() - uploadStartedAt;
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

import { bundle } from '@remotion/bundler';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uploadR2Object } from './r2';

const COMPOSITION_ID = 'MainComposition';
const BUNDLE_DIR = path.join(tmpdir(), 'nayla-remotion-bundle');

// A Vercel function can serve multiple requests while its module stays warm. Reuse
// its immutable bundle, but create a new sandbox for every render because its
// filesystem and lifecycle belong to that single render job.
let bundlePromise: Promise<string> | undefined;

const inputPropsToRecord = (inputProps: unknown): Record<string, unknown> => {
  if (typeof inputProps !== 'object' || inputProps === null || Array.isArray(inputProps)) {
    throw new Error('inputProps debe ser un objeto para renderizar la composición.');
  }

  return inputProps as Record<string, unknown>;
};

const getBundle = async () => {
  bundlePromise ??= bundle({
    entryPoint: path.join(process.cwd(), 'src/remotion/index.ts'),
    outDir: BUNDLE_DIR,
    enableCaching: true,
  }).catch((error: unknown) => {
    bundlePromise = undefined;
    throw error;
  });

  return bundlePromise;
};

/**
 * Bundles the Remotion entry point, renders it in an isolated Vercel Sandbox,
 * then copies the resulting media file to Cloudflare R2.
 */
export async function startVercelSandboxRender(inputProps: unknown, ownerId?: string) {
  const props = inputPropsToRecord(inputProps);
  const { addBundleToSandbox, createSandbox, renderMediaOnVercel } = await import('@remotion/vercel').catch(() => {
    throw new Error('El adaptador @remotion/vercel no está instalado en este entorno. Instálalo durante el despliegue de Vercel Sandbox.');
  });

  const bundleDir = await getBundle();
  const sandbox = await createSandbox();

  try {
    await addBundleToSandbox({ sandbox, bundleDir });

    const { sandboxFilePath, contentType } = await renderMediaOnVercel({
      sandbox,
      compositionId: COMPOSITION_ID,
      inputProps: props,
      codec: 'h264',
      outputFile: '/tmp/render.mp4',
    });

    const file = await sandbox.readFileToBuffer({ path: sandboxFilePath });
    if (!file) {
      throw new Error(`Vercel Sandbox no produjo el archivo de render: ${sandboxFilePath}`);
    }

    const ownerPrefix = ownerId || 'anonymous';
    const key = `${ownerPrefix}/renders/${randomUUID()}.mp4`;
    const stored = await uploadR2Object(key, new Uint8Array(file), contentType);

    return {
      status: 'completed' as const,
      output: stored,
      contentType,
    };
  } finally {
    await sandbox[Symbol.asyncDispose]();
  }
}

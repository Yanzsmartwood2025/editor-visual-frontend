import { uploadR2Object } from './r2';

const dynamicImport = (moduleName: string) => Function('name', 'return import(name)')(moduleName) as Promise<any>;

/**
 * Adapter isolated from the Pages API contract. The deployment must provide the
 * official @remotion/vercel package and VERCEL_SANDBOX_* credentials.
 */
export async function startVercelSandboxRender(inputProps: unknown) {
  const renderer = await dynamicImport('@remotion/vercel').catch(() => {
    throw new Error('El adaptador @remotion/vercel no está instalado en este entorno. Instálalo durante el despliegue de Vercel Sandbox.');
  });
  if (typeof renderer.renderMediaOnVercel !== 'function') {
    throw new Error('@remotion/vercel no expone renderMediaOnVercel; revisa la versión instalada del SDK.');
  }

  const result = await renderer.renderMediaOnVercel({
    entryPoint: 'src/remotion/index.ts',
    composition: 'MainComposition',
    inputProps,
    sandbox: { token: process.env.VERCEL_SANDBOX_TOKEN, projectId: process.env.VERCEL_PROJECT_ID },
  });

  if (!result?.outputUrl) return { jobId: result?.jobId, status: result?.status || 'queued' };
  const response = await fetch(result.outputUrl);
  if (!response.ok) throw new Error(`No se pudo descargar el resultado del Sandbox: ${response.status}`);
  const key = `renders/${result.jobId || crypto.randomUUID()}.mp4`;
  const stored = await uploadR2Object(key, new Uint8Array(await response.arrayBuffer()), 'video/mp4');
  return { jobId: result.jobId, status: 'completed', output: stored };
}

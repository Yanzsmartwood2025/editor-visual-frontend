/**
 * Vercel Sandbox does not expose a normal GPU. Remotion's canvas/WebGL effects
 * need a software-backed WebGL2 implementation there.
 *
 * "swangle" = ANGLE + SwiftShader and is supported by Remotion 4.x for
 * GPU-less Linux rendering.
 */
export const VERCEL_SANDBOX_CHROMIUM_OPTIONS = {
  gl: 'swangle' as const,
};

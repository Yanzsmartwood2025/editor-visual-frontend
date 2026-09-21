import {rm} from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {enableSkia} from '@remotion/skia/enable';

const outDir = path.resolve('.remotion');
await rm(outDir, {recursive: true, force: true});

console.log('[remotion] Building production bundle...');
await bundle({
  entryPoint: path.resolve('src/remotion/index.ts'),
  outDir,
  enableCaching: true,
  webpackOverride: (config, context) => enableSkia(config, context),
});
console.log('[remotion] Bundle ready at .remotion');

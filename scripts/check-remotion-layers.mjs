// Run after npm run build:remotion. Set CHROME_EXECUTABLE to use a managed browser.
import { ensureBrowser, renderStill } from '@remotion/renderer';
import path from 'node:path';
const browserExecutable = process.env.CHROME_EXECUTABLE || null;
if (!browserExecutable) await ensureBrowser();
await renderStill({
  serveUrl: path.resolve('.remotion'),
  browserExecutable,
  composition: { id: 'MainComposition', width: 1080, height: 1920, fps: 30, durationInFrames: 90, defaultProps: {}, props: {}, defaultCodec: 'h264', defaultOutName: null, defaultVideoImageFormat: 'jpeg', defaultPixelFormat: 'yuv420p' },
  inputProps: { timeline: [], canvasRatio: '9/16', settings: { decorations: [
    { kind: 'annotation', mark: 'underline', text: 'Biblioteca conectada', start: 0, end: 3, x: 50, y: 25, width: 800, height: 160, opacity: 1, color: '#ffffff', accentColor: '#fbbf24', fontFamily: 'Arial', fontSize: 64 },
    { kind: 'svg-path', path: 'M 30 150 L 150 30 L 270 150 L 150 270 Z', start: 0, end: 3, x: 30, y: 55, width: 300, height: 300, opacity: 1, color: '#7dd3fc', strokeWidth: 6 },
    { kind: 'svg-3d', path: 'M 50 50 L 200 50 L 200 200 L 50 200 Z', start: 0, end: 3, x: 70, y: 55, width: 360, height: 360, opacity: 1, color: '#7dd3fc', depth: 30, rotationSpeed: 24 },
  ] } },
  frame: 30,
  output: process.env.REMOTION_CHECK_OUTPUT || '/tmp/nayla-layers-check.png',
  imageFormat: 'png',
});

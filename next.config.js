/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  outputFileTracingIncludes: {
    '/api/render': ['./.remotion/**/*'],
  },
};

module.exports = nextConfig;

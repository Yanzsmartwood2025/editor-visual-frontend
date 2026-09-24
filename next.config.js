/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@shopify/react-native-skia'],
  turbopack: {
    resolveAlias: {
      fs: { browser: './src/lib/skiaBrowserFallback.js' },
      'react-native/Libraries/Image/AssetRegistry': './src/lib/skiaBrowserFallback.js',
    },
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  outputFileTracingIncludes: {
    '/api/render': ['./.remotion/**/*'],
  },
};

module.exports = nextConfig;

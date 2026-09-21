/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/render': ['./.remotion/**/*'],
  },
};

module.exports = nextConfig;

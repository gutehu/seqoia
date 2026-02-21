/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mediapipe/pose', '@mediapipe/drawing_utils'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    return config;
  },
};

module.exports = nextConfig;

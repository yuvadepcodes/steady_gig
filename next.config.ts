import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: [
    '*.run.app',
    '*.asia-southeast1.run.app',
    '*.aistudio.google.com',
    '*.google.com',
    'localhost:3000',
    '127.0.0.1:3000',
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

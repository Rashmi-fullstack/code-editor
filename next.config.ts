import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  headers: async () => [
    {
      // Isolate the editor routes where WebContainer SharedArrayBuffer is required
      source: '/editor/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    },
    {
      source: '/editor',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    },
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Optimize for Docker and production
  experimental: {
    // Enable server actions
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.localhost'],
    },
  },
  
  // Redirect configuration
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/auth/dashboard',
        permanent: false,
        has: [
          {
            type: 'cookie',
            key: 'appSession',
          },
        ],
      },
    ];
  },
  
  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

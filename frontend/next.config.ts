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
  
  // Webpack configuration to handle Docker-related modules
  webpack: (config, { isServer }) => {
    // For server-side builds, externalize Docker-related modules
    if (isServer) {
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'dockerode': 'commonjs dockerode',
        'docker-modem': 'commonjs docker-modem',
      });
    }
    
    // For client-side builds, exclude Docker modules entirely
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        util: false,
        ssh2: false,
        dockerode: false,
        'docker-modem': false,
      };
    }
    
    return config;
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

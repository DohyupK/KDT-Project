import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Security-chat can wait up to ~180s (RAG + local LLM). Default proxy cut → socket hang up.
  experimental: {
    proxyTimeout: 190_000,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/ai/:path*',
        // Windows often excludes 7994–8193 (Hyper-V); use 8800 locally.
        destination: 'http://127.0.0.1:8800/:path*',
      },
    ]
  },
}

export default nextConfig

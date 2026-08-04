import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'

// Monorepo root `.env` (KDT-Project/.env) — not frontend/.env
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvConfig(repoRoot)

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

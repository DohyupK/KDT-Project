import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'

// Monorepo root `.env` (KDT-Project/.env) — not frontend/.env
const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(frontendRoot, '..')
loadEnvConfig(repoRoot)

const extraDevOrigins = [
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGINS,
  process.env.ALLOWED_DEV_ORIGINS,
]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((part) => {
    const s = part.trim()
    if (!s) return ''
    try {
      return new URL(s.includes('://') ? s : `http://${s}`).hostname
    } catch {
      return s
    }
  })
  .filter(Boolean)

const nextConfig: NextConfig = {
  // Public-IP `next dev` (Lightsail) needs this or Turbopack HMR websocket is rejected.
  allowedDevOrigins: [...new Set(['localhost', '127.0.0.1', ...extraDevOrigins])],
  // Root package-lock makes Turbopack pick monorepo root; pin to frontend to avoid RSC manifest 500.
  turbopack: {
    root: frontendRoot,
  },
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

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'

// Monorepo root `.env` (KDT-Project/.env) — not frontend/.env
const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(frontendRoot, '..')
loadEnvConfig(repoRoot)

function hostnameFromPart(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  try {
    return new URL(s.includes('://') ? s : `http://${s}`).hostname
  } catch {
    return s
  }
}

function hostsFromCsv(...values: Array<string | undefined>): string[] {
  return values
    .filter(Boolean)
    .join(',')
    .split(',')
    .map(hostnameFromPart)
    .filter(Boolean)
}

/** Direct `.env` parse — `loadEnvConfig` can miss CORS_* if Next already loaded frontend/.env. */
function hostsFromRootEnvFile(): string[] {
  try {
    const text = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8')
    const keys = new Set(['CORS_ORIGIN', 'CORS_ORIGINS', 'ALLOWED_DEV_ORIGINS'])
    const out: string[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      if (!keys.has(key)) continue
      let val = line.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      out.push(...hostsFromCsv(val))
    }
    return out
  } catch {
    return []
  }
}

function localIpv4s(): string[] {
  const out: string[] = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address)
    }
  }
  return out
}

/** Lightsail public IP is often 1:1 NAT — not in `os.networkInterfaces()`. */
function awsPublicIpv4(): string[] {
  if (process.platform === 'win32') return []
  try {
    const ip = execSync(
      'curl -s --max-time 1 http://169.254.169.254/latest/meta-data/public-ipv4',
      { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return [ip]
  } catch {
    /* not on AWS, or IMDS blocked */
  }
  return []
}

const allowedDevOrigins = [
  ...new Set([
    'localhost',
    '127.0.0.1',
    ...hostsFromCsv(
      process.env.CORS_ORIGIN,
      process.env.CORS_ORIGINS,
      process.env.ALLOWED_DEV_ORIGINS,
    ),
    ...hostsFromRootEnvFile(),
    ...localIpv4s(),
    ...awsPublicIpv4(),
  ]),
]

console.log(`[frontend] allowedDevOrigins=${allowedDevOrigins.join(',')}`)
if (
  allowedDevOrigins.length <= 2 &&
  !process.env.CORS_ORIGIN &&
  !process.env.CORS_ORIGINS
) {
  console.warn(
    '[frontend] CORS_ORIGIN is empty — public-IP next dev will block /_next/* and the dashboard will never fetch /api',
  )
}

const nextConfig: NextConfig = {
  // Public-IP `next dev` (Lightsail) needs this or Turbopack HMR / chunks are rejected.
  allowedDevOrigins,
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

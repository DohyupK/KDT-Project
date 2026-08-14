/**
 * Load monorepo root `.env` (KDT-Project/.env) before other modules read process.env.
 *
 * PM2 cwd / compiled layout can make import.meta.url miss the file. Override with
 * ROOT_ENV_PATH (absolute path to that `.env`) in the process environment — not inside `.env`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = path.dirname(fileURLToPath(import.meta.url))

function envCandidates(): string[] {
  const fromEnv = (process.env.ROOT_ENV_PATH || '').trim()
  const list: string[] = []
  if (fromEnv) list.push(path.resolve(fromEnv))
  // src/loadRootEnv.ts or dist/loadRootEnv.js → repo root
  list.push(path.resolve(here, '../..', '.env'))
  list.push(path.resolve(process.cwd(), '.env'))
  list.push(path.resolve(process.cwd(), '..', '.env'))
  return [...new Set(list)]
}

function firstExistingFile(paths: string[]): string | null {
  for (const p of paths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      /* ignore unreadable candidates */
    }
  }
  return null
}

const tried = envCandidates()
const envPath = firstExistingFile(tried)

export const rootEnvPath = envPath
export const rootEnvLoaded = Boolean(envPath)

if (envPath) {
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    console.error(`[backend] failed to parse env file ${envPath}:`, result.error.message)
  } else {
    console.log(`[backend] loaded env from ${envPath}`)
  }
} else {
  console.error(
    `[backend] root .env not found. Tried:\n${tried.map((p) => `  - ${p}`).join('\n')}\n` +
      'Set ROOT_ENV_PATH to the absolute path of KDT-Project/.env (PM2 ecosystem env, not inside .env).',
  )
}

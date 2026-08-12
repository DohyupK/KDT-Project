/**
 * Optionally spawn ai-service (uvicorn) as a child of backend.
 * Default on: AI_SERVICE_AUTOSTART=1. Skip if /health already OK.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let child: ChildProcess | null = null
let startedByUs = false

function autostartEnabled(): boolean {
  const v = (process.env.AI_SERVICE_AUTOSTART ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

function aiBaseUrl(): string {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
}

function resolveAiCwd(): string {
  if (process.env.AI_SERVICE_CWD?.trim()) {
    return path.resolve(process.env.AI_SERVICE_CWD.trim())
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  // backend/src/services → repo/ai-service
  return path.resolve(here, '../../../ai-service')
}

async function healthOk(timeoutMs = 2000): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${aiBaseUrl()}/health`, { signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

function pickPython(): string {
  if (process.env.AI_SERVICE_PYTHON?.trim()) return process.env.AI_SERVICE_PYTHON.trim()
  return process.platform === 'win32' ? 'python' : 'python3'
}

function spawnAiService(cwd: string): ChildProcess {
  const py = pickPython()
  const args = (
    process.env.AI_SERVICE_ARGS ||
    '-m uvicorn app.main:app --host 127.0.0.1 --port 8800'
  )
    .trim()
    .split(/\s+/)
  console.log(`[ai-supervisor] spawning: ${py} ${args.join(' ')} cwd=${cwd}`)
  const proc = spawn(py, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const prefix = (buf: Buffer) => {
    const text = buf.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) console.log(`[ai-service] ${line}`)
    }
  }
  proc.stdout?.on('data', prefix)
  proc.stderr?.on('data', prefix)
  proc.on('exit', (code, signal) => {
    console.log(`[ai-supervisor] ai-service exited code=${code} signal=${signal}`)
    if (child === proc) child = null
  })
  return proc
}

async function waitHealthy(maxMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (await healthOk(1500)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function registerShutdown(): void {
  const stop = () => {
    if (child && startedByUs) {
      console.log('[ai-supervisor] stopping ai-service child')
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      child = null
    }
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  process.once('exit', stop)
}

/**
 * Ensure ai-service is reachable. Spawns uvicorn if needed.
 * @returns true if healthy (or autostart disabled and we skip wait)
 */
export async function startAiServiceSupervisor(): Promise<boolean> {
  if (!autostartEnabled()) {
    console.log('[ai-supervisor] disabled (AI_SERVICE_AUTOSTART=0)')
    return healthOk()
  }

  if (await healthOk()) {
    console.log(`[ai-supervisor] already healthy ${aiBaseUrl()}`)
    return true
  }

  const cwd = resolveAiCwd()
  if (!fs.existsSync(path.join(cwd, 'app', 'main.py'))) {
    console.error(`[ai-supervisor] ai-service not found at ${cwd}`)
    return false
  }

  child = spawnAiService(cwd)
  startedByUs = true
  registerShutdown()

  const maxMs = Number(process.env.AI_SERVICE_READY_MS || 60_000)
  const ok = await waitHealthy(Number.isFinite(maxMs) ? maxMs : 60_000)
  if (!ok) {
    console.error('[ai-supervisor] ai-service health timeout — pollers may fail until it is up')
  } else {
    console.log(`[ai-supervisor] ready ${aiBaseUrl()}`)
  }
  return ok
}

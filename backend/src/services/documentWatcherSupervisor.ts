/**
 * Spawn Documents OCR/watchdog daemon (Python) as a child of backend.
 * Default on: DOCUMENT_WATCHER_AUTOSTART=1.
 *
 * Convert/OCR code stays in ai-service; this only owns the process lifecycle.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let child: ChildProcess | null = null
let startedByUs = false

function autostartEnabled(): boolean {
  const v = (process.env.DOCUMENT_WATCHER_AUTOSTART ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

function resolveAiCwd(): string {
  if (process.env.AI_SERVICE_CWD?.trim()) {
    return path.resolve(process.env.AI_SERVICE_CWD.trim())
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../../ai-service')
}

function pickPython(): string {
  if (process.env.AI_SERVICE_PYTHON?.trim()) return process.env.AI_SERVICE_PYTHON.trim()
  return process.platform === 'win32' ? 'python' : 'python3'
}

function watcherEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SECURE_DOCS_WATCH: '1',
    DOCUMENT_WATCHER_OWNER: 'backend',
  }
  if (process.platform === 'win32') {
    const tessCmd =
      process.env.TESSERACT_CMD?.trim() ||
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
    env.TESSERACT_CMD = tessCmd
    const tessDir = path.dirname(tessCmd)
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
    const cur = env[pathKey] || ''
    if (!cur.toLowerCase().includes('tesseract-ocr')) {
      env[pathKey] = `${tessDir};${cur}`
    }
    // document_convert uses --tessdata-dir; a bad PREFIX breaks OCR.
    delete env.TESSDATA_PREFIX
  }
  return env
}

function registerShutdown(): void {
  const stop = () => {
    if (child && startedByUs) {
      console.log('[doc-watcher] stopping document watcher child')
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
 * Start Python `scripts/run_document_watcher.py` under ai-service/.
 */
export function startDocumentWatcherSupervisor(): boolean {
  if (!autostartEnabled()) {
    console.log('[doc-watcher] disabled (DOCUMENT_WATCHER_AUTOSTART=0)')
    return false
  }

  const cwd = resolveAiCwd()
  const script = path.join(cwd, 'scripts', 'run_document_watcher.py')
  if (!fs.existsSync(script)) {
    console.error(`[doc-watcher] script not found: ${script}`)
    return false
  }

  const py = pickPython()
  console.log(`[doc-watcher] spawning: ${py} scripts/run_document_watcher.py cwd=${cwd}`)
  const proc = spawn(py, ['scripts/run_document_watcher.py'], {
    cwd,
    env: watcherEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child = proc
  startedByUs = true
  registerShutdown()

  const prefix = (buf: Buffer) => {
    const text = buf.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) console.log(`[doc-watcher] ${line}`)
    }
  }
  proc.stdout?.on('data', prefix)
  proc.stderr?.on('data', prefix)
  proc.on('exit', (code, signal) => {
    console.log(`[doc-watcher] exited code=${code} signal=${signal}`)
    if (child === proc) child = null
  })
  return true
}

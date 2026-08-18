/**
 * Start uvicorn :8800 for root `npm run dev`.
 * If /health is already OK (leftover process), reuse it and stay alive so
 * concurrently -k does not tear down backend/frontend on WinError 10013.
 */
const { spawn } = require('child_process')
const path = require('path')

const cwd = path.join(__dirname, '..')
const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8800', '--reload']
const healthUrl = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '') + '/health'

const candidates =
  process.platform === 'win32'
    ? ['py', 'python', 'python3']
    : ['python3', 'python']

function holdForever() {
  // A pending Promise does not keep Node alive; a timer does.
  setInterval(() => {}, 1 << 30)
  return new Promise(() => {})
}

async function healthOk(timeoutMs = 1500) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(healthUrl, { signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

function spawnUvicorn(i) {
  if (i >= candidates.length) {
    console.error('[dev:ai] Python not found. Install Python 3 and ensure it is on PATH.')
    process.exit(127)
    return
  }

  const cmd = candidates[i]
  const childArgs = cmd === 'py' ? ['-3', ...args] : args
  const child = spawn(cmd, childArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

  child.on('error', () => spawnUvicorn(i + 1))
  child.on('exit', (code, signal) => {
    if (code === 127 || code === 9009) {
      spawnUvicorn(i + 1)
      return
    }
    void onUvicornExit(code, signal)
  })
}

async function onUvicornExit(code, signal) {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (await healthOk()) {
    console.log('[dev:ai] uvicorn exited but http://127.0.0.1:8800/health is OK — reusing existing process')
    await holdForever()
    return
  }
  console.error(
    `[dev:ai] uvicorn failed (code=${code ?? 'null'}). Port 8800 may be in use (WinError 10013/10048).`,
  )
  console.error('[dev:ai] backend/frontend will keep running. Check: Get-NetTCPConnection -LocalPort 8800')
  await holdForever()
}

async function main() {
  if (await healthOk()) {
    console.log('[dev:ai] already healthy http://127.0.0.1:8800 — reusing, not spawning another uvicorn')
    await holdForever()
    return
  }
  spawnUvicorn(0)
  await holdForever()
}

void main()

/**
 * Root `npm run dev` already starts ai via `dev:ai`.
 * Disable backend's AI_SERVICE_AUTOSTART so two uvicorns don't race on :8800.
 * If :3001 is already healthy, reuse it so concurrently -k does not kill the stack.
 */
const { spawn } = require('child_process')
const path = require('path')

const port = Number(process.env.PORT || 3001)
const healthUrl = `http://127.0.0.1:${port}/api/health`

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

async function main() {
  if (await healthOk()) {
    console.log(`[dev:backend] already healthy ${healthUrl} — reusing, not spawning another process`)
    await holdForever()
    return
  }

  const env = { ...process.env, AI_SERVICE_AUTOSTART: '0' }
  const child = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}

void main()

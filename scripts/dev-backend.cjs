/**
 * Root `npm run dev` already starts ai via `dev:ai`.
 * Disable backend's AI_SERVICE_AUTOSTART so two uvicorns don't race on :8800.
 */
const { spawn } = require('child_process')
const path = require('path')

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

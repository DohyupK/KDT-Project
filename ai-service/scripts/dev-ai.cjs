const { spawn } = require('child_process')
const path = require('path')

const cwd = path.join(__dirname, '..')
const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8800']

const candidates =
  process.platform === 'win32'
    ? ['py', 'python', 'python3']
    : ['python3', 'python']

function tryNext(i) {
  if (i >= candidates.length) {
    console.error('Python not found. Install Python 3 and ensure it is on PATH.')
    process.exit(127)
  }

  const cmd = candidates[i]
  const childArgs = cmd === 'py' ? ['-3', ...args] : args
  const child = spawn(cmd, childArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

  child.on('error', () => tryNext(i + 1))
  child.on('exit', (code, signal) => {
    if (code === 127 || code === 9009) return tryNext(i + 1)
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}

tryNext(0)
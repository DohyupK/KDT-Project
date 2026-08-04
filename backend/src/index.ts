import './loadRootEnv.js'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
const app = createApp()

const server = app.listen(port, () => {
  console.log(`[backend] listening on http://127.0.0.1:${port}`)
  console.log(`[backend] AI_SERVICE_URL=${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800'}`)
  console.log(`[backend] CHAT_STORE=${process.env.CHAT_STORE || 'mariadb'}`)
})

// Security-chat proxy may wait up to 180s for local RAG+LLM; avoid Node closing early.
server.requestTimeout = 200_000
server.headersTimeout = 205_000
server.keepAliveTimeout = 210_000
server.timeout = 200_000

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[backend] port ${port} already in use. Stop the other process (e.g. Get-NetTCPConnection -LocalPort ${port}) then retry.`,
    )
    process.exit(1)
  }
  console.error('[backend] listen error:', err)
  process.exit(1)
})

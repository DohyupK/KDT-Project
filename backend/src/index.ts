import { rootEnvLoaded } from './loadRootEnv.js'
import { createApp } from './app.js'
import { DEFAULT_DB_NAME, isLoopbackDbHost, mariaDbPoolOptions } from './db/config.js'
import { getChatStoreMode } from './services/chatStore.js'
import { startAiServiceSupervisor } from './services/aiServiceSupervisor.js'
import { startDocumentWatcherSupervisor } from './services/documentWatcherSupervisor.js'
import { startSpcLotSyncPoller } from './services/spcLotSyncPoller.js'
import { startAnalysisLotSyncPoller } from './services/analysisLotSyncPoller.js'
import { runBootScoreOnce } from './services/bootScore.js'

const isManagedRuntime =
  process.env.NODE_ENV === 'production' ||
  process.env.pm_id != null ||
  process.env.PM2_HOME != null

if (isManagedRuntime && !rootEnvLoaded) {
  throw new Error(
    '[backend] FATAL: root .env was not loaded. Set ROOT_ENV_PATH to the absolute path of KDT-Project/.env in the PM2 ecosystem env.',
  )
}

const dbOpts = mariaDbPoolOptions()
if (isManagedRuntime && isLoopbackDbHost(dbOpts.host)) {
  console.error('='.repeat(72))
  console.error('[backend] WARNING: DB_HOST is localhost/127.0.0.1 under PM2/production.')
  console.error(
    `[backend] resolved DB_HOST=${dbOpts.host} DB_NAME=${dbOpts.database} CHAT_STORE=${getChatStoreMode()}`,
  )
  console.error(
    '[backend] Same-machine MariaDB is OK. If you expected a remote DB_HOST, the root .env was missed — set ROOT_ENV_PATH.',
  )
  console.error('='.repeat(72))
}

const port = Number(process.env.PORT || 3001)
const app = createApp()

const server = app.listen(port, () => {
  console.log(`[backend] listening on http://127.0.0.1:${port}`)
  console.log(`[backend] AI_SERVICE_URL=${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800'}`)
  console.log(`[backend] CHAT_STORE=${getChatStoreMode()}`)
  console.log(
    `[backend] DB_HOST=${dbOpts.host} DB_NAME=${dbOpts.database}${process.env.DB_NAME ? '' : ` (default ${DEFAULT_DB_NAME})`}`,
  )
  // Documents OCR / text_match watchdog — lifecycle owned by backend
  startDocumentWatcherSupervisor()
  void (async () => {
    const aiOk = await startAiServiceSupervisor()
    console.log(`[backend] ai_ready=${aiOk} — starting score pollers + boot score`)
    // Pollers: continuous auto-score (SPC ~60s, analysis ~10m). Both tick immediately.
    startSpcLotSyncPoller()
    startAnalysisLotSyncPoller()
    // Explicit one-shot so 기동만으로 미채점 LOT이 바로 돌도록 보장.
    await runBootScoreOnce()
  })()
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

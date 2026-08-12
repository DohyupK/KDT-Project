import { syncSpcLotsToApp } from './spcLotSync.js'

let timer: ReturnType<typeof setInterval> | null = null

function envEnabled(): boolean {
  const v = (process.env.SPC_SYNC_ENABLED ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}

function intervalMs(): number {
  const n = Number(process.env.SPC_SYNC_INTERVAL_MS || 60_000)
  if (!Number.isFinite(n) || n < 5_000) return 60_000
  return Math.floor(n)
}

async function tick() {
  try {
    const result = await syncSpcLotsToApp({ quiet: false, concurrency: 4 })
    if (result.skipped) return
    if (
      result.inserted === 0 &&
      result.scored === 0 &&
      result.failed === 0 &&
      result.issuesCreated === 0
    ) {
      return
    }
    console.log('[spc-sync-poller]', {
      inserted: result.inserted,
      scored: result.scored,
      failed: result.failed,
      issuesCreated: result.issuesCreated,
    })
  } catch (err) {
    console.error('[spc-sync-poller] error', err)
  }
}

/** Start background SPC_LOT → lots sync (default every 60s). No-op if disabled. */
export function startSpcLotSyncPoller(): void {
  if (!envEnabled()) {
    console.log('[spc-sync-poller] disabled (SPC_SYNC_ENABLED=0)')
    return
  }
  if (timer) return

  const ms = intervalMs()
  console.log(`[spc-sync-poller] started interval_ms=${ms}`)
  void tick()
  timer = setInterval(() => {
    void tick()
  }, ms)
  // Allow process to exit even if interval is open (dev restarts); backend is long-lived anyway.
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    timer.unref()
  }
}

export function stopSpcLotSyncPoller(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

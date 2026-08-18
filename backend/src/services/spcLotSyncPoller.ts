import { syncSpcLotsToApp } from './spcLotSync.js'
import { lotScoreOnAws } from './lotScoreRole.js'

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
    const result = await syncSpcLotsToApp({
      quiet: false,
      concurrency: 4,
      skipScore: !lotScoreOnAws(),
    })
    if (result.skipped) {
      console.log('[spc-sync-poller] skipped (already running)')
      return
    }
    console.log('[spc-sync-poller]', {
      inserted: result.inserted,
      scored: result.scored,
      failed: result.failed,
      issuesCreated: result.issuesCreated,
      reasonsUpdated: result.reasonsUpdated,
      errors: result.errors.slice(0, 3),
    })
  } catch (err) {
    console.error('[spc-sync-poller] error', err)
  }
}

/** Start background SPC_LOT → lots sync + score (default every 60s). Runs once immediately on boot. */
export function startSpcLotSyncPoller(): void {
  if (!envEnabled()) {
    console.log('[spc-sync-poller] disabled (SPC_SYNC_ENABLED=0)')
    return
  }
  if (timer) return

  const ms = intervalMs()
  console.log(`[spc-sync-poller] started interval_ms=${ms} (immediate boot tick)`)
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

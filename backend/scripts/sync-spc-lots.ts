/**
 * CLI: Mirror SPC_LOT → lots, then score (same as backend poller).
 */
import '../src/loadRootEnv.js'
import { syncSpcLotsToApp } from '../src/services/spcLotSync.js'

async function main() {
  const skipScore = process.argv.includes('--skip-score')
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 4

  const result = await syncSpcLotsToApp({
    skipScore,
    concurrency: Number.isFinite(concurrency) ? concurrency : 4,
    quiet: false,
  })
  console.log('SYNC_RESULT', result)
  if (result.failed > 0) process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

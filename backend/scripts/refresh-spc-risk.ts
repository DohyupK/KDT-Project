/**
 * Recompute SPC + risk_level from stored probability/residual (no AI).
 * Usage:
 *   npx tsx scripts/refresh-spc-risk.ts
 *   npx tsx scripts/refresh-spc-risk.ts --lot=LOT-20260807-11708
 *   npx tsx scripts/refresh-spc-risk.ts --lots=LOT-A,LOT-B
 */
import '../src/loadRootEnv.js'
import * as lotService from '../src/services/lot.service.js'

async function main() {
  const lotArg = process.argv.find((a) => a.startsWith('--lot='))
  const lotsArg = process.argv.find((a) => a.startsWith('--lots='))
  let lotIds: string[] | undefined
  if (lotArg) {
    lotIds = [lotArg.split('=').slice(1).join('=').trim()].filter(Boolean)
  } else if (lotsArg) {
    lotIds = lotsArg
      .split('=')
      .slice(1)
      .join('=')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  console.log('REFRESH_SPC_RISK_START', { lotIds: lotIds?.length ?? 'all' })
  const started = Date.now()
  let lastLog = 0
  const result = await lotService.refreshSpcAndRiskScores({
    lotIds,
    onProgress: (done, total, lotId) => {
      if (done - lastLog >= 500 || done === total) {
        lastLog = done
        console.log(`PROGRESS ${done}/${total} last=${lotId}`)
      }
    },
  })
  console.log(
    'REFRESH_SPC_RISK_DONE',
    JSON.stringify(result),
    `elapsed_ms=${Date.now() - started}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

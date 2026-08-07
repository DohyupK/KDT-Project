import '../src/loadRootEnv.js'
import * as lotService from '../src/services/lot.service.js'

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const latestArg = process.argv.find((a) => a.startsWith('--latest='))
  const offsetArg = process.argv.find((a) => a.startsWith('--offset='))
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  const latest = latestArg ? Number(latestArg.split('=')[1]) : undefined
  const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0
  const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 4

  let lotIds: string[] | undefined
  if (Number.isFinite(latest) && latest! > 0) {
    lotIds = await lotService.getLatestLotIds(latest!)
    console.log('LATEST_LOT_IDS', lotIds.length)
  }

  console.log('SCORE_START', { limit, latest, lotIds: lotIds?.length, offset, concurrency })
  const started = Date.now()
  let lastLog = 0
  const result = await lotService.scoreAllLots({
    limit: lotIds ? undefined : Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : 0,
    lotIds,
    concurrency: Number.isFinite(concurrency) ? concurrency : 4,
    onProgress: (done, total, lotId) => {
      if (done - lastLog >= 50 || done === total) {
        lastLog = done
        console.log(`PROGRESS ${done}/${total} last=${lotId}`)
      }
    },
  })
  console.log('SCORE_DONE', JSON.stringify(result), `elapsed_ms=${Date.now() - started}`)

  const issuesCreated = await lotService.ensureIssuesForRiskLots()
  console.log('ISSUES_CREATED', issuesCreated)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

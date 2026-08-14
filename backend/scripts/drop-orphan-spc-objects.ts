import '../src/loadRootEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'

const DROP_NAMES = [
  'v_spc_charts',
  'lot_spc_results',
  'control_bounds',
] as const

const KEEP_NAMES = ['SPC_LOT', 'SPC_LOT_results', 'LOT_RESULTS'] as const

async function main() {
  const sqlPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../DB/drop_orphan_spc_objects.sql',
  )
  const sql = fs.readFileSync(sqlPath, 'utf8')

  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  const names = [...DROP_NAMES, ...KEEP_NAMES]
  const inList = names.map(() => '?').join(', ')

  try {
    const before = (await conn.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${inList})
       ORDER BY TABLE_NAME`,
      names,
    )) as { TABLE_NAME: string; TABLE_TYPE: string }[]
    console.log(
      'BEFORE',
      before.map((r) => `${r.TABLE_NAME}(${r.TABLE_TYPE})`),
    )

    await conn.query(sql)
    console.log('DROP_SQL_OK')

    const after = (await conn.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${inList})
       ORDER BY TABLE_NAME`,
      names,
    )) as { TABLE_NAME: string; TABLE_TYPE: string }[]
    const remaining = after.map((r) => r.TABLE_NAME)
    const droppedGone = DROP_NAMES.every((n) => !remaining.includes(n))
    const keptPresent = KEEP_NAMES.every((n) => remaining.includes(n))

    console.log(
      'AFTER',
      after.map((r) => `${r.TABLE_NAME}(${r.TABLE_TYPE})`),
    )
    console.log('ORPHANS_GONE', droppedGone)
    console.log('KEPT_TABLES', keptPresent)

    if (!droppedGone) {
      throw new Error(
        `Expected orphans gone; still present: ${remaining.filter((n) => (DROP_NAMES as readonly string[]).includes(n)).join(', ')}`,
      )
    }
    if (!keptPresent) {
      console.warn(
        'WARN: SPC_LOT / SPC_LOT_results / LOT_RESULTS missing (feeder or DDL may CREATE later)',
      )
    }
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

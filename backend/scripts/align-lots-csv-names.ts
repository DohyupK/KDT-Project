import '../src/loadRootEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mariadb from 'mariadb'

async function main() {
  const sqlPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../DB/align_lots_csv_column_names.sql',
  )
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const db = process.env.DB_NAME!

  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: db,
    multipleStatements: true,
  })

  try {
    const beforeCount = (await conn.query('SELECT COUNT(*) AS c FROM LOTS')) as {
      c: bigint | number
    }[]
    console.log('BEFORE', { count: Number(beforeCount[0]?.c ?? 0) })

    await conn.query(sql)
    console.log('ALTER_OK')

    const cols = (await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'LOTS'
       ORDER BY ORDINAL_POSITION`,
      [db],
    )) as { COLUMN_NAME: string }[]
    const fks = (await conn.query(
      `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = 'LOTS'`,
      [db],
    )) as {
      TABLE_NAME: string
      CONSTRAINT_NAME: string
      COLUMN_NAME: string
      REFERENCED_COLUMN_NAME: string
    }[]
    const afterCount = (await conn.query('SELECT COUNT(*) AS c FROM LOTS')) as {
      c: bigint | number
    }[]
    const sample = (await conn.query(
      'SELECT id, `timestamp`, operator_id FROM LOTS ORDER BY `timestamp` ASC LIMIT 1',
    )) as { id: string; timestamp: Date; operator_id: string }[]

    console.log('COLS', cols.map((c) => c.COLUMN_NAME).join(', '))
    console.log(
      'FKS',
      fks.map(
        (f) =>
          `${f.TABLE_NAME}.${f.COLUMN_NAME}->lots.${f.REFERENCED_COLUMN_NAME}`,
      ),
    )
    console.log('AFTER', {
      count: Number(afterCount[0]?.c ?? 0),
      sampleId: sample[0]?.id,
    })

    if (Number(afterCount[0]?.c ?? 0) !== Number(beforeCount[0]?.c ?? 0)) {
      throw new Error('Row count changed')
    }
    if (!cols.some((c) => c.COLUMN_NAME === 'id')) {
      throw new Error('missing id')
    }
    if (cols.some((c) => c.COLUMN_NAME === 'lot_id' || c.COLUMN_NAME === 'imported_at')) {
      throw new Error('old columns still present')
    }
    if (cols.some((c) => c.COLUMN_NAME === 'residual_li')) {
      throw new Error('residual_li should not be on lots')
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

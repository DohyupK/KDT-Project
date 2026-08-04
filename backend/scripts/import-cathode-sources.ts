import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mariadb, { type Connection } from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NUMERIC_FEATURES = [
  'd50',
  'd90',
  'metal_impurity',
  'lithium_input',
  'additive_ratio',
  'process_time',
  'sintering_temp',
  'humidity',
  'tank_pressure',
] as const

type DatasetKey = 'clf' | 'capacity' | 'residual'
type DatasetConfig = {
  key: DatasetKey
  fileName: string
  tableName: string
  targetColumn: 'quality_defect' | 'capacity' | 'residual_li'
}

const DATASETS: Record<DatasetKey, DatasetConfig> = {
  clf: {
    key: 'clf',
    fileName: 'cathode_clf_data.csv',
    tableName: 'cathode_clf_samples',
    targetColumn: 'quality_defect',
  },
  capacity: {
    key: 'capacity',
    fileName: 'cathode_reg_data.csv',
    tableName: 'cathode_capacity_samples',
    targetColumn: 'capacity',
  },
  residual: {
    key: 'residual',
    fileName: 'cathode_qc_reg_data.csv',
    tableName: 'cathode_residual_samples',
    targetColumn: 'residual_li',
  },
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}

function nullableNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveDataDirectory(): string {
  if (process.env.CATHODE_DATA_DIR) return path.resolve(process.env.CATHODE_DATA_DIR)
  return path.resolve(__dirname, '../../ai-service/data')
}

function selectedDatasets(): DatasetConfig[] {
  const option = process.argv.find((arg) => arg.startsWith('--dataset='))
  const requested = option?.slice('--dataset='.length) ?? 'all'
  if (requested === 'all') return Object.values(DATASETS)
  if (requested in DATASETS) return [DATASETS[requested as DatasetKey]]
  throw new Error('dataset은 clf, capacity, residual, all 중 하나여야 합니다.')
}

function readDataset(config: DatasetConfig) {
  const filePath = path.join(resolveDataDirectory(), config.fileName)
  if (!fs.existsSync(filePath)) throw new Error(`CSV 파일을 찾을 수 없습니다: ${filePath}`)

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new Error(`${config.fileName}에 데이터가 없습니다.`)

  const header = parseCsvLine(lines[0]).map((value) => value.trim())
  const required = ['id', 'timestamp', ...NUMERIC_FEATURES, 'operator_id', config.targetColumn]
  const missingHeaders = required.filter((column) => !header.includes(column))
  if (missingHeaders.length > 0) {
    throw new Error(`${config.fileName} 필수 컬럼 누락: ${missingHeaders.join(', ')}`)
  }

  const indexOf = (column: string) => header.indexOf(column)
  const nullCounts = Object.fromEntries(NUMERIC_FEATURES.map((column) => [column, 0])) as Record<
    (typeof NUMERIC_FEATURES)[number],
    number
  >
  const rows: unknown[][] = []
  let skipped = 0

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = parseCsvLine(lines[lineIndex])
    const lotId = columns[indexOf('id')]?.trim()
    const timestamp = columns[indexOf('timestamp')]?.trim().replace('T', ' ').slice(0, 19)
    const target = nullableNumber(columns[indexOf(config.targetColumn)])
    if (!lotId || !timestamp || target == null) {
      skipped += 1
      continue
    }
    if (config.key === 'clf' && target !== 0 && target !== 1) {
      skipped += 1
      continue
    }

    const featureValues = NUMERIC_FEATURES.map((column) => {
      const value = nullableNumber(columns[indexOf(column)])
      if (value == null) nullCounts[column] += 1
      return value
    })
    rows.push([
      lotId,
      timestamp,
      ...featureValues,
      columns[indexOf('operator_id')]?.trim() || null,
      target,
    ])
  }

  return {
    filePath,
    inputRows: lines.length - 1,
    rows,
    skipped,
    nullCounts,
  }
}

async function importDataset(
  conn: Connection,
  config: DatasetConfig,
): Promise<Record<string, unknown>> {
  const parsed = readDataset(config)
  const countBefore = await conn.query<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM ${config.tableName}`,
  )
  const columns = [
    'lot_id',
    'recorded_at',
    ...NUMERIC_FEATURES,
    'operator_id',
    config.targetColumn,
  ]
  const updateSql = columns
    .slice(1)
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ')
  const sql = `INSERT INTO ${config.tableName} (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE ${updateSql}, imported_at = CURRENT_TIMESTAMP`

  await conn.beginTransaction()
  try {
    for (let start = 0; start < parsed.rows.length; start += 500) {
      await conn.batch(sql, parsed.rows.slice(start, start + 500))
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  }

  const countAfter = await conn.query<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM ${config.tableName}`,
  )
  const before = Number(countBefore[0]?.count ?? 0)
  const after = Number(countAfter[0]?.count ?? 0)
  const inserted = Math.max(0, after - before)
  return {
    dataset: config.key,
    table: config.tableName,
    source: parsed.filePath,
    inputRows: parsed.inputRows,
    upserted: parsed.rows.length,
    inserted,
    updatedOrUnchanged: parsed.rows.length - inserted,
    skipped: parsed.skipped,
    nullCounts: parsed.nullCounts,
    tableRows: after,
  }
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    for (const config of selectedDatasets()) {
      const result = await importDataset(conn, config)
      console.log(JSON.stringify(result))
    }
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

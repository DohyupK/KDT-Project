import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mariadb, { type Connection } from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEATURES = [
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

const DATASETS = [
  {
    fileName: 'cathode_clf_data.csv',
    tableName: 'cathode_clf_samples',
    target: 'quality_defect',
  },
  {
    fileName: 'cathode_reg_data.csv',
    tableName: 'cathode_capacity_samples',
    target: 'capacity',
  },
  {
    fileName: 'cathode_qc_reg_data.csv',
    tableName: 'cathode_residual_samples',
    target: 'residual_li',
  },
] as const

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

function formatDateTime(value: Date | string): string {
  if (typeof value === 'string') return value.replace('T', ' ').slice(0, 19)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function readCsv(fileName: string, target: string) {
  const dataDirectory = process.env.CATHODE_DATA_DIR
    ? path.resolve(process.env.CATHODE_DATA_DIR)
    : path.resolve(__dirname, '../../ai-service/data')
  const filePath = path.join(dataDirectory, fileName)
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  const header = parseCsvLine(lines[0]).map((value) => value.trim())
  const indexOf = (column: string) => header.indexOf(column)
  const rows = lines.slice(1).map(parseCsvLine)
  const nullCounts = Object.fromEntries(
    FEATURES.map((feature) => [
      feature,
      rows.filter((row) => nullableNumber(row[indexOf(feature)]) == null).length,
    ]),
  ) as Record<(typeof FEATURES)[number], number>
  const first = rows[0]
  return {
    count: rows.length,
    nullCounts,
    sample: {
      lot_id: first[indexOf('id')].trim(),
      recorded_at: first[indexOf('timestamp')].trim().replace('T', ' ').slice(0, 19),
      ...Object.fromEntries(
        FEATURES.map((feature) => [feature, nullableNumber(first[indexOf(feature)])]),
      ),
      operator_id: first[indexOf('operator_id')]?.trim() || null,
      [target]: nullableNumber(first[indexOf(target)]),
    } as Record<string, unknown>,
  }
}

function equalValue(csvValue: unknown, dbValue: unknown): boolean {
  if (csvValue == null || dbValue == null) return csvValue == null && dbValue == null
  if (typeof csvValue === 'number') {
    return Math.abs(csvValue - Number(dbValue)) <= Math.max(1e-9, Math.abs(csvValue) * 1e-12)
  }
  return String(csvValue) === String(dbValue)
}

async function verifyDataset(
  conn: Connection,
  dataset: (typeof DATASETS)[number],
): Promise<Record<string, unknown>> {
  const csv = readCsv(dataset.fileName, dataset.target)
  const nullExpressions = FEATURES.map(
    (feature) => `SUM(${feature} IS NULL) AS ${feature}_nulls`,
  ).join(', ')
  const aggregateRows = await conn.query<Record<string, unknown>[]>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT lot_id) AS distinct_lots,
            SUM(${dataset.target} IS NULL) AS target_nulls,
            ${nullExpressions}
     FROM ${dataset.tableName}`,
  )
  const aggregate = aggregateRows[0]
  const total = Number(aggregate?.total ?? 0)
  const distinctLots = Number(aggregate?.distinct_lots ?? 0)
  const targetNulls = Number(aggregate?.target_nulls ?? 0)
  if (total !== csv.count) throw new Error(`${dataset.tableName}: CSV/DB 행 수가 다릅니다.`)
  if (distinctLots !== total) throw new Error(`${dataset.tableName}: lot_id 중복이 있습니다.`)
  if (targetNulls !== 0) throw new Error(`${dataset.tableName}: 타깃 NULL이 있습니다.`)

  for (const feature of FEATURES) {
    const dbNulls = Number(aggregate?.[`${feature}_nulls`] ?? 0)
    if (dbNulls !== csv.nullCounts[feature]) {
      throw new Error(`${dataset.tableName}.${feature}: CSV/DB NULL 수가 다릅니다.`)
    }
  }

  const sampleRows = await conn.query<Record<string, unknown>[]>(
    `SELECT lot_id, recorded_at, ${FEATURES.join(', ')}, operator_id, ${dataset.target}
     FROM ${dataset.tableName} WHERE lot_id = ? LIMIT 1`,
    [csv.sample.lot_id],
  )
  const sample = sampleRows[0]
  if (!sample) throw new Error(`${dataset.tableName}: 표본 LOT을 찾을 수 없습니다.`)
  for (const [column, csvValue] of Object.entries(csv.sample)) {
    const dbValue = column === 'recorded_at' ? formatDateTime(sample[column] as Date | string) : sample[column]
    if (!equalValue(csvValue, dbValue)) {
      throw new Error(`${dataset.tableName}.${column}: 표본값이 CSV와 다릅니다.`)
    }
  }

  return {
    table: dataset.tableName,
    rows: total,
    targetNulls,
    nullCounts: csv.nullCounts,
    sampleLotId: csv.sample.lot_id,
    status: 'ok',
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
    for (const dataset of DATASETS) {
      console.log(JSON.stringify(await verifyDataset(conn, dataset)))
    }
    const intersectionRows = await conn.query<{ count: number }[]>(
      `SELECT COUNT(*) AS count
       FROM cathode_clf_samples clf
       INNER JOIN cathode_capacity_samples capacity USING (lot_id)
       INNER JOIN cathode_residual_samples residual USING (lot_id)`,
    )
    console.log(
      JSON.stringify({
        commonLotIds: Number(intersectionRows[0]?.count ?? 0),
        status: 'ok',
      }),
    )
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

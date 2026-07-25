import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { withConn } from '../db.js'

export type ControlStoreMode = 'memory' | 'mariadb' | 'sqlite'

export type OptimizationEventInput = {
  sessionId: string | null
  lotId: string | null
  beforeFeatures: Record<string, unknown>
  proposedDeltas: Record<string, unknown>
  afterFeatures: Record<string, unknown>
  probBefore: number
  probAfter: number
  method: string
  status?: string
}

export type OptimizationEventRow = {
  id: number | string
  status: string
}

type MemEvent = OptimizationEventInput & {
  id: string
  status: string
  createdAt: number
  outcomeQualityDefect: number | null
}

const mem: MemEvent[] = []

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SQLITE = path.resolve(__dirname, '../../data/control.sqlite')

let sqliteDb: DatabaseSync | null = null

function storeMode(): ControlStoreMode {
  const raw = (
    process.env.CONTROL_STORE ||
    process.env.CHAT_STORE ||
    'sqlite'
  )
    .trim()
    .toLowerCase()
  if (raw === 'memory' || raw === 'mariadb' || raw === 'sqlite') return raw
  return 'sqlite'
}

export function getControlStoreMode(): ControlStoreMode {
  return storeMode()
}

function getSqlite(): DatabaseSync {
  if (sqliteDb) return sqliteDb
  const dbPath = process.env.CONTROL_SQLITE_PATH || DEFAULT_SQLITE
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  sqliteDb = new DatabaseSync(dbPath)
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS optimization_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      lot_id TEXT,
      before_features TEXT NOT NULL,
      proposed_deltas TEXT NOT NULL,
      after_features TEXT NOT NULL,
      prob_before REAL NOT NULL,
      prob_after REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      outcome_quality_defect INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_optimization_events_created
      ON optimization_events(created_at);
  `)
  return sqliteDb
}

async function ensureMariaTable(): Promise<void> {
  await withConn(async (conn) => {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS optimization_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(64) NULL,
        lot_id VARCHAR(128) NULL,
        before_features LONGTEXT NOT NULL,
        proposed_deltas LONGTEXT NOT NULL,
        after_features LONGTEXT NOT NULL,
        prob_before DOUBLE NOT NULL,
        prob_after DOUBLE NOT NULL,
        method VARCHAR(64) NOT NULL,
        status VARCHAR(64) NOT NULL,
        outcome_quality_defect TINYINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  })
}

export async function insertOptimizationEvent(
  input: OptimizationEventInput,
): Promise<OptimizationEventRow> {
  const status = input.status || 'approved_logged'
  const mode = storeMode()

  if (mode === 'memory') {
    const id = randomUUID()
    mem.push({
      ...input,
      id,
      status,
      createdAt: Date.now(),
      outcomeQualityDefect: null,
    })
    return { id, status }
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const result = db
      .prepare(
        `INSERT INTO optimization_events (
          session_id, lot_id, before_features, proposed_deltas, after_features,
          prob_before, prob_after, method, status, outcome_quality_defect
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        input.sessionId,
        input.lotId,
        JSON.stringify(input.beforeFeatures),
        JSON.stringify(input.proposedDeltas),
        JSON.stringify(input.afterFeatures),
        input.probBefore,
        input.probAfter,
        input.method,
        status,
      )
    return { id: Number(result.lastInsertRowid), status }
  }

  await ensureMariaTable()
  return withConn(async (conn) => {
    const result = await conn.query(
      `INSERT INTO optimization_events (
        session_id, lot_id, before_features, proposed_deltas, after_features,
        prob_before, prob_after, method, status, outcome_quality_defect
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        input.sessionId,
        input.lotId,
        JSON.stringify(input.beforeFeatures),
        JSON.stringify(input.proposedDeltas),
        JSON.stringify(input.afterFeatures),
        input.probBefore,
        input.probAfter,
        input.method,
        status,
      ],
    )
    const insertId =
      result && typeof result === 'object' && 'insertId' in result
        ? Number((result as { insertId: number }).insertId)
        : randomUUID()
    return { id: insertId, status }
  })
}

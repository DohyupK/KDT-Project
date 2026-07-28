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
  capacityBefore?: number | null
  capacityAfter?: number | null
}

export type OptimizationEventRow = {
  id: number | string
  status: string
}

export type OutcomeInput = {
  outcomeQualityDefect: 0 | 1
  outcomeCapacity?: number | null
}

type MemEvent = OptimizationEventInput & {
  id: string
  status: string
  createdAt: number
  outcomeQualityDefect: number | null
  outcomeCapacity: number | null
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

function ensureSqliteColumns(db: DatabaseSync): void {
  const cols = db
    .prepare(`PRAGMA table_info(optimization_events)`)
    .all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  const alter = (name: string, ddl: string) => {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE optimization_events ADD COLUMN ${ddl}`)
      names.add(name)
    }
  }
  alter('capacity_before', 'capacity_before REAL')
  alter('capacity_after', 'capacity_after REAL')
  alter('outcome_capacity', 'outcome_capacity REAL')
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
      capacity_before REAL,
      capacity_after REAL,
      outcome_capacity REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_optimization_events_created
      ON optimization_events(created_at);
  `)
  ensureSqliteColumns(sqliteDb)
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
        capacity_before DOUBLE NULL,
        capacity_after DOUBLE NULL,
        outcome_capacity DOUBLE NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    // Best-effort column adds for older MariaDB tables
    for (const ddl of [
      'ADD COLUMN capacity_before DOUBLE NULL',
      'ADD COLUMN capacity_after DOUBLE NULL',
      'ADD COLUMN outcome_capacity DOUBLE NULL',
    ]) {
      try {
        await conn.query(`ALTER TABLE optimization_events ${ddl}`)
      } catch {
        // column may already exist
      }
    }
  })
}

export async function insertOptimizationEvent(
  input: OptimizationEventInput,
): Promise<OptimizationEventRow> {
  const status = input.status || 'approved'
  const mode = storeMode()
  const capacityBefore =
    input.capacityBefore === undefined ? null : input.capacityBefore
  const capacityAfter =
    input.capacityAfter === undefined ? null : input.capacityAfter

  if (mode === 'memory') {
    const id = randomUUID()
    mem.push({
      ...input,
      capacityBefore,
      capacityAfter,
      id,
      status,
      createdAt: Date.now(),
      outcomeQualityDefect: null,
      outcomeCapacity: null,
    })
    return { id, status }
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const result = db
      .prepare(
        `INSERT INTO optimization_events (
          session_id, lot_id, before_features, proposed_deltas, after_features,
          prob_before, prob_after, method, status, outcome_quality_defect,
          capacity_before, capacity_after, outcome_capacity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
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
        capacityBefore,
        capacityAfter,
      )
    return { id: Number(result.lastInsertRowid), status }
  }

  await ensureMariaTable()
  return withConn(async (conn) => {
    const result = await conn.query(
      `INSERT INTO optimization_events (
        session_id, lot_id, before_features, proposed_deltas, after_features,
        prob_before, prob_after, method, status, outcome_quality_defect,
        capacity_before, capacity_after, outcome_capacity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
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
        capacityBefore,
        capacityAfter,
      ],
    )
    const insertId =
      result && typeof result === 'object' && 'insertId' in result
        ? Number((result as { insertId: number }).insertId)
        : randomUUID()
    return { id: insertId, status }
  })
}

/**
 * Undo path: never DELETE — mark status=reverted to keep audit history.
 * Wired from POST /api/control/approve/:id/revert (GlobalChatbot 5s Undo).
 */
export async function revertOptimizationEvent(
  eventId: number | string,
): Promise<OptimizationEventRow | null> {
  const mode = storeMode()
  const idStr = String(eventId)

  if (mode === 'memory') {
    const row = mem.find((e) => String(e.id) === idStr)
    if (!row) return null
    row.status = 'reverted'
    return { id: row.id, status: row.status }
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const existing = db
      .prepare('SELECT id, status FROM optimization_events WHERE id = ? LIMIT 1')
      .get(Number(eventId) || eventId) as { id: number; status: string } | undefined
    if (!existing) return null
    if (existing.status === 'reverted') {
      return { id: existing.id, status: 'reverted' }
    }
    db.prepare(`UPDATE optimization_events SET status = 'reverted' WHERE id = ?`).run(
      existing.id,
    )
    return { id: existing.id, status: 'reverted' }
  }

  await ensureMariaTable()
  return withConn(async (conn) => {
    const rows = await conn.query(
      'SELECT id, status FROM optimization_events WHERE id = ? LIMIT 1',
      [eventId],
    )
    if (!Array.isArray(rows) || rows.length === 0) return null
    const existing = rows[0] as { id: number | string; status: string }
    if (existing.status === 'reverted') {
      return { id: existing.id, status: 'reverted' }
    }
    await conn.query(`UPDATE optimization_events SET status = 'reverted' WHERE id = ?`, [
      existing.id,
    ])
    return { id: existing.id, status: 'reverted' }
  })
}

/**
 * Record measured outcome only (no synthetic data).
 * POST /api/control/approve/:id/outcome
 */
export async function updateOptimizationOutcome(
  eventId: number | string,
  input: OutcomeInput,
): Promise<OptimizationEventRow | null> {
  const mode = storeMode()
  const idStr = String(eventId)
  const defect = input.outcomeQualityDefect
  if (defect !== 0 && defect !== 1) {
    throw new Error('outcome_quality_defect must be 0 or 1')
  }
  const capacity =
    input.outcomeCapacity === undefined || input.outcomeCapacity === null
      ? null
      : Number(input.outcomeCapacity)
  if (capacity !== null && !Number.isFinite(capacity)) {
    throw new Error('outcome_capacity must be a finite number')
  }

  if (mode === 'memory') {
    const row = mem.find((e) => String(e.id) === idStr)
    if (!row) return null
    row.outcomeQualityDefect = defect
    row.outcomeCapacity = capacity
    return { id: row.id, status: row.status }
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const existing = db
      .prepare('SELECT id, status FROM optimization_events WHERE id = ? LIMIT 1')
      .get(Number(eventId) || eventId) as { id: number; status: string } | undefined
    if (!existing) return null
    db.prepare(
      `UPDATE optimization_events
       SET outcome_quality_defect = ?, outcome_capacity = ?
       WHERE id = ?`,
    ).run(defect, capacity, existing.id)
    return { id: existing.id, status: existing.status }
  }

  await ensureMariaTable()
  return withConn(async (conn) => {
    const rows = await conn.query(
      'SELECT id, status FROM optimization_events WHERE id = ? LIMIT 1',
      [eventId],
    )
    if (!Array.isArray(rows) || rows.length === 0) return null
    const existing = rows[0] as { id: number | string; status: string }
    await conn.query(
      `UPDATE optimization_events
       SET outcome_quality_defect = ?, outcome_capacity = ?
       WHERE id = ?`,
      [defect, capacity, existing.id],
    )
    return { id: existing.id, status: existing.status }
  })
}

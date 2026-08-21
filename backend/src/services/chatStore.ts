import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { withConn } from '../db.js'

export type ChatRole = 'user' | 'assistant'
export type ChatStoreMode = 'memory' | 'mariadb' | 'sqlite'

type MemMessage = {
  role: ChatRole
  content: string
  mode?: string | null
  provider?: string | null
  createdAt: number
}

export type RecentChatMessage = Pick<MemMessage, 'role' | 'content'>

type MemSession = {
  id: string
  messages: MemMessage[]
}

const mem = new Map<string, MemSession>()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SQLITE = path.resolve(__dirname, '../../../DB/data/chat.sqlite')

let sqliteDb: DatabaseSync | null = null

function storeMode(): ChatStoreMode {
  const raw = (process.env.CHAT_STORE || 'mariadb').trim().toLowerCase()
  if (raw === 'memory' || raw === 'mariadb' || raw === 'sqlite') return raw
  return 'mariadb'
}

export function getChatStoreMode(): ChatStoreMode {
  return storeMode()
}

/** Keep the legacy CHAT_* session isolated per authenticated user. */
export function scopedSessionId(
  userId: string,
  externalThreadId: string | undefined | null,
  channel: 'general' | 'security',
): string | undefined {
  const uid = userId.trim()
  const tid = String(externalThreadId || '').trim()
  if (!uid || !tid) return undefined
  const hex = createHash('sha256')
    .update(`${uid}\0${channel}\0${tid}`)
    .digest('hex')
    .slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function getSqlite(): DatabaseSync {
  if (sqliteDb) return sqliteDb
  const dbPath = process.env.CHAT_SQLITE_PATH || DEFAULT_SQLITE
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  sqliteDb = new DatabaseSync(dbPath)
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS CHAT_SESSIONS (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS CHAT_MESSAGES (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mode TEXT,
      provider TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES CHAT_SESSIONS(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON CHAT_MESSAGES(session_id, created_at);
  `)
  return sqliteDb
}

export async function ensureSession(sessionId: string | undefined | null): Promise<string> {
  const mode = storeMode()

  if (mode === 'memory') {
    if (sessionId && mem.has(sessionId)) return sessionId
    const id = randomUUID()
    mem.set(id, { id, messages: [] })
    return id
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    if (sessionId) {
      const row = db.prepare('SELECT id FROM CHAT_SESSIONS WHERE id = ? LIMIT 1').get(sessionId)
      if (row) return sessionId
    }
    const id = randomUUID()
    db.prepare('INSERT INTO CHAT_SESSIONS (id) VALUES (?)').run(id)
    return id
  }

  return withConn(async (conn) => {
    if (sessionId) {
      const rows = await conn.query(
        'SELECT id FROM CHAT_SESSIONS WHERE id = ? LIMIT 1',
        [sessionId],
      )
      if (Array.isArray(rows) && rows.length > 0) {
        return sessionId
      }
    }
    const id = randomUUID()
    await conn.query('INSERT INTO CHAT_SESSIONS (id) VALUES (?)', [id])
    return id
  })
}

/**
 * Create/load a deterministic legacy session that cannot collide across users.
 * Unlike ensureSession(), the scoped id is inserted as-is so it can be deleted
 * reliably from the external thread id later.
 */
export async function ensureScopedSession(
  userId: string,
  externalThreadId: string,
  channel: 'general' | 'security',
): Promise<string> {
  const id = scopedSessionId(userId, externalThreadId, channel)
  if (!id) throw new Error('authenticated user and thread id are required')
  const mode = storeMode()

  if (mode === 'memory') {
    if (!mem.has(id)) mem.set(id, { id, messages: [] })
    return id
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    db.prepare('INSERT OR IGNORE INTO CHAT_SESSIONS (id) VALUES (?)').run(id)
    return id
  }

  return withConn(async (conn) => {
    await conn.query('INSERT IGNORE INTO CHAT_SESSIONS (id) VALUES (?)', [id])
    return id
  })
}

export async function loadRecentUserMessages(sessionId: string): Promise<string[]> {
  const mode = storeMode()

  if (mode === 'memory') {
    const s = mem.get(sessionId)
    if (!s) return []
    return s.messages
      .filter((m) => m.role === 'user')
      .slice(-20)
      .map((m) => m.content)
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const rows = db
      .prepare(
        `SELECT content FROM CHAT_MESSAGES
         WHERE session_id = ? AND role = 'user'
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
      )
      .all(sessionId) as { content: string }[]
    return rows.map((r) => r.content).reverse()
  }

  return withConn(async (conn) => {
    const rows = await conn.query(
      `SELECT content FROM CHAT_MESSAGES
       WHERE session_id = ? AND role = 'user'
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [sessionId],
    )
    if (!Array.isArray(rows)) return []
    return (rows as { content: string }[]).map((r) => r.content).reverse()
  })
}

/** Recent full dialogue for the authenticated ai-service history fallback. */
export async function loadRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<RecentChatMessage[]> {
  const mode = storeMode()
  const safeLimit = Math.max(1, Math.min(40, Math.floor(limit)))

  if (mode === 'memory') {
    const session = mem.get(sessionId)
    return (session?.messages ?? [])
      .slice(-safeLimit)
      .map(({ role, content }) => ({ role, content }))
  }

  if (mode === 'sqlite') {
    const db = getSqlite()
    const rows = db
      .prepare(
        `SELECT role, content FROM CHAT_MESSAGES
         WHERE session_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(sessionId, safeLimit) as RecentChatMessage[]
    return rows.reverse()
  }

  return withConn(async (conn) => {
    const rows = await conn.query(
      `SELECT role, content FROM CHAT_MESSAGES
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [sessionId, safeLimit],
    )
    if (!Array.isArray(rows)) return []
    return (rows as RecentChatMessage[]).reverse()
  })
}

export async function insertMessage(
  sessionId: string,
  role: ChatRole,
  content: string,
  mode?: string | null,
  provider?: string | null,
): Promise<void> {
  const store = storeMode()

  if (store === 'memory') {
    let s = mem.get(sessionId)
    if (!s) {
      s = { id: sessionId, messages: [] }
      mem.set(sessionId, s)
    }
    s.messages.push({
      role,
      content,
      mode,
      provider,
      createdAt: Date.now(),
    })
    return
  }

  if (store === 'sqlite') {
    const db = getSqlite()
    db.prepare(
      `INSERT INTO CHAT_MESSAGES (session_id, role, content, mode, provider)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, role, content, mode ?? null, provider ?? null)
    return
  }

  await withConn(async (conn) => {
    await conn.query(
      `INSERT INTO CHAT_MESSAGES (session_id, role, content, mode, provider)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, role, content, mode ?? null, provider ?? null],
    )
  })
}

/** For tests: how many user messages are stored for a session. */
export async function countUserMessages(sessionId: string): Promise<number> {
  const msgs = await loadRecentUserMessages(sessionId)
  return msgs.length
}

export async function deleteSession(sessionId: string | undefined | null): Promise<boolean> {
  if (!sessionId) return false
  const mode = storeMode()

  if (mode === 'memory') return mem.delete(sessionId)

  if (mode === 'sqlite') {
    const db = getSqlite()
    const result = db.prepare('DELETE FROM CHAT_SESSIONS WHERE id = ?').run(sessionId)
    return Number(result.changes || 0) > 0
  }

  return withConn(async (conn) => {
    const result = await conn.query('DELETE FROM CHAT_SESSIONS WHERE id = ?', [sessionId])
    return Number(result?.affectedRows || 0) > 0
  })
}

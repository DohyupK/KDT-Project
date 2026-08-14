import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

const MAX_IDS = 500

export type HeaderNotifStateDto = {
  readIds: string[]
  dismissedIds: string[]
}

type HeaderNotifStateRow = {
  user_id: string
  read_ids: unknown
  dismissed_ids: unknown
}

function parseIdArray(value: unknown): string[] {
  if (value == null) return []
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    throw new AppError(400, 'ids는 문자열 배열이어야 합니다.')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    if (typeof raw !== 'string') continue
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_IDS) break
  }
  return out
}

/** Keep newest-appended IDs when over cap (merge appends at end). */
function trimIds(ids: string[]): string[] {
  if (ids.length <= MAX_IDS) return ids
  return ids.slice(ids.length - MAX_IDS)
}

function mergeIds(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing)
  const next = [...existing]
  for (const id of incoming) {
    if (set.has(id)) continue
    set.add(id)
    next.push(id)
  }
  return trimIds(next)
}

function toDto(row: HeaderNotifStateRow | undefined): HeaderNotifStateDto {
  if (!row) return { readIds: [], dismissedIds: [] }
  return {
    readIds: parseIdArray(row.read_ids),
    dismissedIds: parseIdArray(row.dismissed_ids),
  }
}

async function ensureRow(userId: string): Promise<HeaderNotifStateDto> {
  const rows = await query<HeaderNotifStateRow[]>(
    `SELECT user_id, read_ids, dismissed_ids
     FROM user_header_notif_state WHERE user_id = ? LIMIT 1`,
    [userId],
  )
  if (rows[0]) return toDto(rows[0])

  await query(
    `INSERT INTO user_header_notif_state (user_id, read_ids, dismissed_ids)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId, '[]', '[]'],
  )
  return { readIds: [], dismissedIds: [] }
}

async function saveState(userId: string, state: HeaderNotifStateDto): Promise<HeaderNotifStateDto> {
  const readJson = JSON.stringify(trimIds(state.readIds))
  const dismissedJson = JSON.stringify(trimIds(state.dismissedIds))
  await query(
    `INSERT INTO user_header_notif_state (user_id, read_ids, dismissed_ids)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       read_ids = VALUES(read_ids),
       dismissed_ids = VALUES(dismissed_ids)`,
    [userId, readJson, dismissedJson],
  )
  return {
    readIds: trimIds(state.readIds),
    dismissedIds: trimIds(state.dismissedIds),
  }
}

export async function getHeaderNotifState(userId: string): Promise<HeaderNotifStateDto> {
  return ensureRow(userId)
}

export async function markHeaderNotifsRead(
  userId: string,
  ids: unknown,
): Promise<HeaderNotifStateDto> {
  const incoming = normalizeIds(ids)
  const current = await ensureRow(userId)
  if (incoming.length === 0) return current
  return saveState(userId, {
    readIds: mergeIds(current.readIds, incoming),
    dismissedIds: current.dismissedIds,
  })
}

export async function dismissHeaderNotifs(
  userId: string,
  ids: unknown,
): Promise<HeaderNotifStateDto> {
  const incoming = normalizeIds(ids)
  const current = await ensureRow(userId)
  if (incoming.length === 0) return current
  return saveState(userId, {
    readIds: mergeIds(current.readIds, incoming),
    dismissedIds: mergeIds(current.dismissedIds, incoming),
  })
}

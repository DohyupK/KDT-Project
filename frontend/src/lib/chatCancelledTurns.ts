/** UI-only cancelled turns. Backend rows stay; hydrate hides the following assistant. */

export const CANCELLED_TURN_NOTICE = '대화가 취소되었습니다.'

export type ChatCancelChannel = 'general' | 'security'

type CancelledTurn = {
  channel: ChatCancelChannel
  threadId: string
  userText: string
  cancelledAt: string
}

const STORAGE_KEY = 'kdt_chat_cancelled_turns'
const MAX_TURNS = 80

function readCancelledTurns(): CancelledTurn[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is CancelledTurn =>
        Boolean(
          row &&
            typeof row === 'object' &&
            (row as CancelledTurn).channel &&
            typeof (row as CancelledTurn).threadId === 'string' &&
            typeof (row as CancelledTurn).userText === 'string',
        ),
    )
  } catch {
    return []
  }
}

function writeCancelledTurns(list: CancelledTurn[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(list.slice(-MAX_TURNS)),
  )
}

export function rememberCancelledTurn(
  channel: ChatCancelChannel,
  threadId: string,
  userText: string,
) {
  const text = userText.trim()
  if (!threadId || !text) return
  const next = readCancelledTurns()
  next.push({
    channel,
    threadId,
    userText: text,
    cancelledAt: new Date().toISOString(),
  })
  writeCancelledTurns(next)
}

export function applyCancelledTurns<T>(
  channel: ChatCancelChannel,
  threadId: string,
  rows: T[],
  opts: {
    getRole: (row: T) => 'user' | 'ai'
    getText: (row: T) => string
    makeNotice: () => T
  },
): T[] {
  if (!threadId || !rows.length) return rows
  const cancels = readCancelledTurns().filter(
    (c) => c.channel === channel && c.threadId === threadId,
  )
  if (!cancels.length) return rows
  const used = new Set<number>()
  const out: T[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const role = opts.getRole(row)
    if (role === 'ai' && i > 0 && opts.getRole(rows[i - 1]) === 'user') {
      const prevText = opts.getText(rows[i - 1]).trim()
      const text = opts.getText(row).trim()
      if (text !== CANCELLED_TURN_NOTICE) {
        const idx = cancels.findIndex(
          (c, j) => !used.has(j) && c.userText === prevText,
        )
        if (idx >= 0) {
          used.add(idx)
          out.push(opts.makeNotice())
          continue
        }
      }
    }
    out.push(row)
  }
  return out
}

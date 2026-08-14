const LOT_KEY = 'issue_action_draft_lot'
const TEXT_KEY = 'issue_action_draft_text'

let memory: { lotId: string; text: string } | null = null
let clearTimer: ReturnType<typeof setTimeout> | null = null

/** Dashboard 「이슈에 복사」 → 이슈 관리 조치 내용. 메모리+sessionStorage (Strict Mode 대비). */
export function saveIssueActionDraft(lotId: string, text: string) {
  const trimmed = text.trim()
  if (!lotId || !trimmed) return
  memory = { lotId, text: trimmed }
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  try {
    sessionStorage.setItem(LOT_KEY, lotId)
    sessionStorage.setItem(TEXT_KEY, trimmed)
  } catch {
    /* ignore quota */
  }
}

export function readIssueActionDraft(lotId: string): string | null {
  if (!lotId) return null
  if (memory?.lotId === lotId && memory.text) return memory.text
  try {
    if (sessionStorage.getItem(LOT_KEY) === lotId) {
      return sessionStorage.getItem(TEXT_KEY)
    }
  } catch {
    /* private mode */
  }
  return null
}

/** Strict Mode 재마운트 후에도 읽을 수 있도록 잠시 뒤에 지운다. */
export function clearIssueActionDraft() {
  const snapshot = memory
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    if (memory === snapshot) {
      memory = null
      try {
        sessionStorage.removeItem(LOT_KEY)
        sessionStorage.removeItem(TEXT_KEY)
      } catch {
        /* ignore */
      }
    }
    clearTimer = null
  }, 2000)
}

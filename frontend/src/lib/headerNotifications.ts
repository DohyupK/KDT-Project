import { dashboardApi } from '@/api/dashboardApi'
import { inquiryApi } from '@/api/inquiryApi'
import { issueApi } from '@/api/issueApi'
import { mainApi } from '@/api/mainApi'
import {
  NOTIFICATION_TYPE_SPEC,
  type HeaderNotification,
  type NotificationPriority,
} from '@/config/headerNotificationSpec'

export const HEADER_NOTIF_LOOKBACK_DAYS = 3
export const HEADER_NOTIF_PAGE_SIZE = 5
/** 미조치(action 없음) 이슈 에스컬레이션: 생성 후 30분 */
export const PENDING_ISSUE_ESCALATION_MS = 30 * 60 * 1000

const READ_KEY = 'kdt-header-notif-read'
const DISMISSED_KEY = 'kdt-header-notif-dismissed'

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
}

type RawNotification = HeaderNotification & { sortAt: number; lotId?: string }

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function lookbackCutoff(now = new Date()): Date {
  const d = new Date(now.getTime())
  d.setDate(d.getDate() - HEADER_NOTIF_LOOKBACK_DAYS)
  return d
}

/** Accepts ISO or backend `YYYY-MM-DD HH:mm:ss`. */
function parseTime(value: string | null | undefined): number {
  if (!value) return 0
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const t = Date.parse(normalized)
  return Number.isFinite(t) ? t : 0
}

function isWithinLookback(iso: string | null | undefined, cutoffMs: number): boolean {
  const t = parseTime(iso)
  return t >= cutoffMs
}

function formatRelativeTime(iso: string, now = new Date()): string {
  const t = parseTime(iso)
  if (!t) return ''
  const diffSec = Math.max(0, Math.floor((now.getTime() - t) / 1000))
  if (diffSec < 60) return '방금 전'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < HEADER_NOTIF_LOOKBACK_DAYS) return `${diffDay}일 전`
  return `${toYmd(new Date(t))}`
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
}

function readIdSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...ids]))
}

export function getReadNotificationIds(): Set<string> {
  return readIdSet(READ_KEY)
}

export function getDismissedNotificationIds(): Set<string> {
  return readIdSet(DISMISSED_KEY)
}

export function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return
  const next = getReadNotificationIds()
  for (const id of ids) next.add(id)
  writeIdSet(READ_KEY, next)
}

export function dismissNotifications(ids: string[]) {
  if (ids.length === 0) return
  const next = getDismissedNotificationIds()
  for (const id of ids) next.add(id)
  writeIdSet(DISMISSED_KEY, next)
}

function applyLocalState(items: HeaderNotification[]): HeaderNotification[] {
  const dismissed = getDismissedNotificationIds()
  const read = getReadNotificationIds()
  return items
    .filter((item) => !dismissed.has(item.id))
    .map((item) => ({
      ...item,
      unread: !read.has(item.id),
    }))
}

function sortRaw(items: RawNotification[]): RawNotification[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (p !== 0) return p
    return b.sortAt - a.sortAt
  })
}

async function collectRaw(now = new Date()): Promise<RawNotification[]> {
  const cutoff = lookbackCutoff(now)
  const cutoffMs = cutoff.getTime()
  const startDate = toYmd(cutoff)
  const endDate = toYmd(now)
  const raw: RawNotification[] = []
  const escalatedLotIds = new Set<string>()
  const coveredLotIds = new Set<string>()

  const [riskSettled, spcSettled, issuesSettled, handoverSettled, inquirySettled] =
    await Promise.allSettled([
      mainApi.getRiskTop({ page: 1, pageSize: 50 }),
      dashboardApi.listLotRisks({ page: 1, pageSize: 50, spc: '이탈' }),
      issueApi.list(),
      issueApi.listHandoverHistory('pending'),
      inquiryApi.list({ status: '접수', startDate, endDate, page: 1, pageSize: 50 }),
    ])

  // 1) 30분 미조치 이슈 → pending_issue (에스컬레이션)
  if (issuesSettled.status === 'fulfilled') {
    const spec = NOTIFICATION_TYPE_SPEC.pending_issue
    for (const issue of issuesSettled.value.data.issues ?? []) {
      if (!isWithinLookback(issue.createdAt, cutoffMs)) continue
      if (issue.hasAction) continue
      const sortAt = parseTime(issue.createdAt)
      if (!sortAt || now.getTime() - sortAt < PENDING_ISSUE_ESCALATION_MS) continue

      escalatedLotIds.add(issue.lotId)
      coveredLotIds.add(issue.lotId)
      raw.push({
        id: `pending_issue:${issue.issueId}`,
        type: 'pending_issue',
        priority: spec.priority,
        time: formatRelativeTime(issue.createdAt, now),
        title: spec.titleTemplate,
        message: fillTemplate(spec.messageTemplate, {
          issueId: issue.issueId,
          title: (issue.issueContent || '').trim() || issue.lotId,
        }),
        unread: true,
        href: `/issue?issueId=${encodeURIComponent(issue.issueId)}&lotId=${encodeURIComponent(issue.lotId)}`,
        sortAt,
        lotId: issue.lotId,
      })
    }
  }

  // 2) 고위험 LOT — 에스컬레이션된 LOT은 제외
  if (riskSettled.status === 'fulfilled') {
    const spec = NOTIFICATION_TYPE_SPEC.high_risk_lot
    for (const lot of riskSettled.value.data.lots ?? []) {
      if (!isWithinLookback(lot.recordedAt, cutoffMs)) continue
      if (escalatedLotIds.has(lot.lotId)) continue
      const sortAt = parseTime(lot.recordedAt)
      coveredLotIds.add(lot.lotId)
      raw.push({
        id: `high_risk_lot:${lot.lotId}`,
        type: 'high_risk_lot',
        priority: spec.priority,
        time: formatRelativeTime(lot.recordedAt, now),
        title: spec.titleTemplate,
        message: fillTemplate(spec.messageTemplate, {
          lotId: lot.lotId,
          grade: lot.riskLevel || '심각',
          reason: (lot.riskReason || '').trim() || '고위험 LOT',
        }),
        unread: true,
        href: `/issue?lotId=${encodeURIComponent(lot.lotId)}`,
        sortAt,
        lotId: lot.lotId,
      })
    }
  }

  // 3) SPC — 이미 고위험/에스컬레이션된 LOT은 생략
  if (spcSettled.status === 'fulfilled') {
    const spec = NOTIFICATION_TYPE_SPEC.spc_breach
    for (const lot of spcSettled.value.data.items ?? []) {
      if (!isWithinLookback(lot.recordedAt, cutoffMs)) continue
      if (coveredLotIds.has(lot.lotId)) continue
      const sortAt = parseTime(lot.recordedAt)
      coveredLotIds.add(lot.lotId)
      const param =
        (lot.riskReason || '').trim() ||
        (lot.spcStatus ? `SPC ${lot.spcStatus}` : 'SPC')
      raw.push({
        id: `spc_breach:${lot.lotId}`,
        type: 'spc_breach',
        priority: spec.priority,
        time: formatRelativeTime(lot.recordedAt, now),
        title: spec.titleTemplate,
        message: fillTemplate(spec.messageTemplate, {
          lotId: lot.lotId,
          param,
        }),
        unread: true,
        href: spec.defaultHref,
        sortAt,
        lotId: lot.lotId,
      })
    }
  }

  if (handoverSettled.status === 'fulfilled') {
    const spec = NOTIFICATION_TYPE_SPEC.handover_pending
    for (const item of handoverSettled.value.data.items ?? []) {
      if (!isWithinLookback(item.createdAt, cutoffMs)) continue
      const sortAt = parseTime(item.createdAt)
      raw.push({
        id: `handover_pending:${item.historyId}`,
        type: 'handover_pending',
        priority: spec.priority,
        time: formatRelativeTime(item.createdAt, now),
        title: spec.titleTemplate,
        message: fillTemplate(spec.messageTemplate, {
          handoverContent: (item.handoverContent || '').trim() || '인수인계 대기',
        }),
        unread: true,
        href: spec.defaultHref,
        sortAt,
      })
    }
  }

  if (inquirySettled.status === 'fulfilled') {
    const spec = NOTIFICATION_TYPE_SPEC.inquiry_unanswered
    for (const item of inquirySettled.value.data.items ?? []) {
      const sortAt = parseTime(item.date)
      if (sortAt > 0 && sortAt < cutoffMs) continue
      raw.push({
        id: `inquiry_unanswered:${item.id}`,
        type: 'inquiry_unanswered',
        priority: spec.priority,
        time: formatRelativeTime(item.date || now.toISOString(), now),
        title: spec.titleTemplate,
        message: fillTemplate(spec.messageTemplate, {
          inquiryCode: item.id,
          category: item.category || '문의',
        }),
        unread: true,
        href: `/inquiry?id=${encodeURIComponent(item.id)}`,
        sortAt: sortAt || now.getTime(),
      })
    }
  }

  return sortRaw(raw)
}

/** Fetch live sources (3-day window), apply localStorage read/dismiss, return UI list. */
export async function loadHeaderNotifications(): Promise<HeaderNotification[]> {
  const raw = await collectRaw()
  return applyLocalState(
    raw.map(({ sortAt: _sortAt, lotId: _lotId, ...item }) => item),
  )
}

/**
 * Header notification contract (SSOT).
 *
 * ShellHeader loads live sources via `lib/headerNotifications.ts` (3-day lookback).
 * Escalation: 심각 LOT → immediate `high_risk_lot`; after 30 minutes without
 * issue action (`hasAction`), that LOT switches to `pending_issue` only in the
 * header bell (Main/Dashboard/Issue pages still show the LOT).
 * Read / dismiss: localStorage `kdt-header-notif-read`, `kdt-header-notif-dismissed`.
 * Deep links: `/issue?lotId=` | `/issue?issueId=&lotId=` | `/inquiry?id=`.
 */

export type NotificationPriority = 'P0' | 'P1' | 'P2'

export type HeaderNotificationType =
  | 'high_risk_lot'
  | 'spc_breach'
  | 'pending_issue'
  | 'handover_pending'
  | 'inquiry_unanswered'

export type HeaderNotification = {
  id: string
  type: HeaderNotificationType
  priority: NotificationPriority
  /** Relative or absolute time label for the UI */
  time: string
  title: string
  message: string
  unread: boolean
  /** Click navigation target (may include query for deep link) */
  href?: string
}

export type NotificationTypeMeta = {
  priority: NotificationPriority
  titleTemplate: string
  messageTemplate: string
  defaultHref: string
  /** Documented source used by the frontend aggregator (or a future notifications API) */
  futureApiSource: string
}

export const NOTIFICATION_TYPE_SPEC: Record<HeaderNotificationType, NotificationTypeMeta> = {
  high_risk_lot: {
    priority: 'P0',
    titleTemplate: '고위험 LOT 감지',
    messageTemplate: '{lotId} 위험등급 {grade}. {reason}',
    defaultHref: '/issue',
    futureApiSource: 'GET /api/lots/risk-top',
  },
  spc_breach: {
    priority: 'P0',
    titleTemplate: 'SPC 관리한계 이탈',
    messageTemplate: '{lotId} {param} UCL/LCL 이탈',
    defaultHref: '/dashboard',
    futureApiSource: 'GET /api/dashboard/lot-risks?spc=이탈',
  },
  pending_issue: {
    priority: 'P1',
    titleTemplate: '처리 대기 이슈',
    messageTemplate: '{issueId} {title} — 담당 확인 필요',
    defaultHref: '/issue',
    futureApiSource: 'GET /api/issues (createdAt≥30m, !hasAction)',
  },
  handover_pending: {
    priority: 'P1',
    titleTemplate: '인수인계 대기',
    messageTemplate: '{handoverContent}',
    defaultHref: '/knowledge',
    futureApiSource: 'GET /api/knowledge/handover-history?status=pending',
  },
  inquiry_unanswered: {
    priority: 'P2',
    titleTemplate: '문의 답변 대기',
    messageTemplate: '{inquiryCode} {category} 문의 미처리',
    defaultHref: '/inquiry',
    futureApiSource: 'GET /api/inquiries',
  },
}
